import { PermissionKey } from "@prisma/client";
import { KeyRound, Pencil, Plus, ShieldCheck } from "lucide-react";
import {
  createRole,
  createUser,
  deleteRole,
  deleteUser,
  updateRole,
  updateRolePermissions,
  updateUser,
} from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { MasterDataToolbar } from "@/components/master-data-toolbar";
import {
  NoticeFromParams,
  type PageSearchParams,
} from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { SortableTh } from "@/components/sortable-th";
import { TableSearch } from "@/components/table-search";
import { requirePermission } from "@/lib/auth";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { defaultPermissions, permissionLabels, roleDisplayName } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const current = await requirePermission(PermissionKey.USER_MANAGE);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "name");
  const sortDirection = readSortDirectionParam(params, "dir", "asc");
  const superadmin = current.role === "SUPERADMIN";
  const [users, roles, configuredPermissions, expenseCategories, configuredExpenseCategoryPermissions] = await Promise.all([
    prisma.user.findMany({ where: { deletedAt: null, ...(superadmin ? {} : { role: { not: "SUPERADMIN" } }) }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.role.findMany({ where: { deletedAt: null, ...(superadmin ? {} : { code: { not: "SUPERADMIN" } }) }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.rolePermission.findMany(),
    prisma.expenseCategory.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.roleExpenseCategoryPermission.findMany(),
  ]);
  const activeRoles = roles.filter((role) => role.active);
  const filteredUsers = users.filter((item) =>
    matchesSearch(
      query,
      item.name,
      item.email,
      roleDisplayName(item.role, roles),
    ),
  );
  const sortedUsers = [...filteredUsers].sort((left, right) => {
    switch (sortKey) {
      case "email":
        return compareValues(left.email, right.email, sortDirection);
      case "role":
        return compareValues(roleDisplayName(left.role, roles), roleDisplayName(right.role, roles), sortDirection);
      case "status":
        return compareValues(left.active, right.active, sortDirection);
      default:
        return compareValues(left.name, right.name, sortDirection);
    }
  });
  const paginatedUsers = paginateItems(sortedUsers, page, pageSize);
  const canRoles = current.permissions.includes(PermissionKey.ROLE_MANAGE);
  const userForm = (item?: (typeof users)[number]) => (
    <form action={item ? updateUser : createUser} className="form-stack">
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <label>
        Nama
        <input defaultValue={item?.name} name="name" required />
      </label>
      <label>
        Email
        <input defaultValue={item?.email} name="email" required type="email" />
      </label>
      <div className="field-grid">
        <label>
          Password
          <input
            name="password"
            placeholder={
              item ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"
            }
            required={!item}
            type="password"
          />
        </label>
        <label>
          Role
          <select defaultValue={item?.role} name="role">
            {activeRoles.map((role) => (
              <option key={role.code} value={role.code}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {item ? (
        <label>
          Status
          <select defaultValue={String(item.active)} name="active">
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
      ) : null}
      <div className="form-actions">
        <ModalCancelButton />
        <button
          className={`btn ${item ? "btn-edit" : "btn-save"}`}
          type="submit"
        >
          {item ? "Simpan Perubahan" : "Simpan Pengguna"}
        </button>
      </div>
    </form>
  );
  const roleSettingsForm = (role?: (typeof roles)[number]) => (
    <form action={role ? updateRole : createRole} className="form-stack">
      {role ? <input name="id" type="hidden" value={role.id} /> : null}
      <label>
        Nama Role
        <input defaultValue={role?.name} name="name" placeholder="Contoh: Tata Usaha" required />
      </label>
      {role ? (
        <label>
          Status
          <select defaultValue={String(role.active)} name="active">
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
      ) : null}
      <div className="form-actions">
        <ModalCancelButton />
        <button className={`btn ${role ? "btn-edit" : "btn-save"}`} type="submit">
          {role ? "Simpan Role" : "Tambah Role"}
        </button>
      </div>
    </form>
  );
  const roleForm = (role: (typeof roles)[number]) => {
    const roleConfiguration = configuredPermissions.filter((item) => item.role === role.code);
    const configured = roleConfiguration
      .filter((item) => item.allowed)
      .map((item) => item.permission);
    const selected = roleConfiguration.length ? configured : (defaultPermissions[role.code] ?? []);
    const categoryConfiguration = configuredExpenseCategoryPermissions.filter((item) => item.role === role.code);
    const selectedExpenseCategoryIds = categoryConfiguration.length
      ? categoryConfiguration.filter((item) => item.allowed).map((item) => item.expenseCategoryId)
      : expenseCategories.map((category) => category.id);
    return (
      <form action={updateRolePermissions} className="form-stack">
        <input name="role" type="hidden" value={role.code} />
        <div className="permission-group-title">Akses Menu & Fitur</div>
        <div className="permission-checkbox-grid">
          {Object.values(PermissionKey).map((permission) => (
            <label
              className="permission-checkbox"
              key={permission}
            >
              <input
                defaultChecked={selected.includes(permission)}
                name="permissions"
                type="checkbox"
                value={permission}
              />
              <span>{permissionLabels[permission]}</span>
            </label>
          ))}
        </div>
        <div className="permission-group-title">Akses Submenu Kategori Pengeluaran</div>
        {expenseCategories.length ? (
          <div className="permission-checkbox-grid">
            {expenseCategories.map((category) => (
              <label className="permission-checkbox" key={category.id}>
                <input
                  defaultChecked={selectedExpenseCategoryIds.includes(category.id)}
                  name="expenseCategoryIds"
                  type="checkbox"
                  value={category.id}
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="empty-inline">Belum ada kategori pengeluaran aktif.</p>
        )}
        <div className="form-actions">
          <ModalCancelButton />
          <button className="btn btn-save" type="submit">
            Simpan Hak Akses
          </button>
        </div>
      </form>
    );
  };
  return (
    <main className="page">
      <MasterDataToolbar
        actions={
          <>
            {canRoles ? (
              <>
              <Modal
                title="Tambah Role"
                trigger={
                  <button className="btn btn-secondary" type="button">
                    <ShieldCheck size={16} /> Tambah Role
                  </button>
                }
              >
                {roleSettingsForm()}
              </Modal>
              <Modal
                size="lg"
                title="Atur Hak Akses"
                description="Pilih role lalu tentukan menu dan fitur yang dapat digunakan."
                trigger={
                  <button className="btn btn-secondary" type="button">
                    <KeyRound size={16} /> Atur Hak Akses
                  </button>
                }
              >
                <div className="role-permission-list">
                  {roles.map((role, index) => (
                    <details key={role.code} open={index === 0}>
                      <summary>
                        <span>
                          <KeyRound size={16} />
                          <strong>{role.name}</strong>
                        </span>
                        <small>{role.active ? "Atur akses" : "Nonaktif"}</small>
                      </summary>
                      <div className="role-management-card">
                        {roleSettingsForm(role)}
                        {role.code !== "ADMIN" && role.code !== "SUPERADMIN" ? (
                          <ConfirmDelete
                            action={deleteRole}
                            id={role.id}
                            label="role"
                          />
                        ) : null}
                      </div>
                      {roleForm(role)}
                    </details>
                  ))}
                </div>
              </Modal>
              </>
            ) : null}
          <Modal
            title="Tambah Pengguna"
            trigger={
              <button className="btn btn-create" type="button">
                <Plus size={17} /> Tambah Pengguna
              </button>
            }
          >
            {userForm()}
          </Modal>
          </>
        }
      >
        <div className="table-toolbar-controls"><TableSearch placeholder="Cari nama, email, atau role pengguna" query={query} /><TablePageSizeSelect pageSize={paginatedUsers.pageSize} pathname="/master/pengguna" preserve={{ dir: sortDirection, q: query, sort: sortKey }} /></div>
      </MasterDataToolbar>
      <NoticeFromParams searchParams={searchParams} />
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nama" pathname="/master/pengguna" preserve={{ pageSize: String(pageSize), q: query }} sortKey="name" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Email" pathname="/master/pengguna" preserve={{ pageSize: String(pageSize), q: query }} sortKey="email" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Role" pathname="/master/pengguna" preserve={{ pageSize: String(pageSize), q: query }} sortKey="role" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Status" pathname="/master/pengguna" preserve={{ pageSize: String(pageSize), q: query }} sortKey="status" />
                <th className="table-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.items.length ? (
                paginatedUsers.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="table-number">{paginatedUsers.startItem + index}</td>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.email}</td>
                    <td>
                      {roleDisplayName(item.role, roles)}
                    </td>
                    <td>
                      <span
                        className={`badge ${item.active ? "green" : "rose"}`}
                      >
                        {item.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="table-actions">
                      <div className="table-action-buttons">
                        <Modal
                          title="Ubah Pengguna"
                          trigger={
                            <button
                              aria-label="Ubah pengguna"
                              className="btn-icon btn-edit"
                              title="Ubah pengguna"
                              type="button"
                            >
                              <Pencil size={15} />
                            </button>
                          }
                        >
                          {userForm(item)}
                        </Modal>
                        <ConfirmDelete
                          action={deleteUser}
                          id={item.id}
                          label="pengguna"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={6}>
                    Data pengguna tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedUsers.currentPage} endItem={paginatedUsers.endItem} pageSize={paginatedUsers.pageSize} pathname="/master/pengguna" preserve={{ dir: sortDirection, q: query, sort: sortKey }} startItem={paginatedUsers.startItem} totalItems={paginatedUsers.totalItems} totalPages={paginatedUsers.totalPages} />
      </section>
    </main>
  );
}
