import { PermissionKey, UserRole } from "@prisma/client";
import { KeyRound, Pencil, Plus } from "lucide-react";
import {
  createUser,
  deleteUser,
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
import { defaultPermissions, permissionLabels } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

const roles = [
  { value: UserRole.ADMIN, label: "Administrator" },
  { value: UserRole.BENDAHARA, label: "Bendahara" },
  { value: UserRole.KEPALA_SEKOLAH, label: "Kepala Sekolah" },
];

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
  const [users, configuredPermissions] = await Promise.all([
    prisma.user.findMany({ where: { deletedAt: null }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.rolePermission.findMany(),
  ]);
  const filteredUsers = users.filter((item) =>
    matchesSearch(
      query,
      item.name,
      item.email,
      roles.find((role) => role.value === item.role)?.label,
    ),
  );
  const sortedUsers = [...filteredUsers].sort((left, right) => {
    switch (sortKey) {
      case "email":
        return compareValues(left.email, right.email, sortDirection);
      case "role":
        return compareValues(roles.find((role) => role.value === left.role)?.label, roles.find((role) => role.value === right.role)?.label, sortDirection);
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
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
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
  const roleForm = (role: UserRole) => {
    const roleConfiguration = configuredPermissions.filter((item) => item.role === role);
    const configured = roleConfiguration
      .filter((item) => item.allowed)
      .map((item) => item.permission);
    const selected = roleConfiguration.length ? configured : defaultPermissions[role];
    return (
      <form action={updateRolePermissions} className="form-stack">
        <input name="role" type="hidden" value={role} />
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
                    <details key={role.value} open={index === 0}>
                      <summary>
                        <span>
                          <KeyRound size={16} />
                          <strong>{role.label}</strong>
                        </span>
                        <small>Atur akses</small>
                      </summary>
                      {roleForm(role.value)}
                    </details>
                  ))}
                </div>
              </Modal>
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
                      {roles.find((role) => role.value === item.role)?.label}
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
