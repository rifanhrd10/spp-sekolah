import { PermissionKey } from "@prisma/client";
import { Pencil, Plus } from "lucide-react";
import { createClassRoom, deleteClassRoom, updateClassRoom } from "@/app/actions";
import { MasterDataToolbar } from "@/components/master-data-toolbar";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { SortableTh } from "@/components/sortable-th";
import { TableSearch } from "@/components/table-search";
import { requirePermission } from "@/lib/auth";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

export default async function ClassRoomsPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requirePermission(PermissionKey.MASTER_CLASS);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "level");
  const sortDirection = readSortDirectionParam(params, "dir", "asc");
  const levelOrder: Record<string, number> = {
    VII: 1,
    VIII: 2,
    IX: 3,
  };
  const [classes] = await Promise.all([
    prisma.classRoom.findMany({ where: { deletedAt: null }, include: { students: { where: { deletedAt: null } } }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
  ]);
  const filteredClasses = classes.filter((item) => matchesSearch(query, item.name, item.level, item.homeroom));
  const sortedClasses = [...filteredClasses].sort((left, right) => {
    switch (sortKey) {
      case "level":
        return compareValues(
          levelOrder[left.level] ?? Number.MAX_SAFE_INTEGER,
          levelOrder[right.level] ?? Number.MAX_SAFE_INTEGER,
          sortDirection,
        ) || compareValues(left.name, right.name, sortDirection);
      case "homeroom":
        return compareValues(left.homeroom, right.homeroom, sortDirection);
      case "students":
        return compareValues(left.students.length, right.students.length, sortDirection);
      case "status":
        return compareValues(left.active, right.active, sortDirection);
      default:
        return compareValues(
          levelOrder[left.level] ?? Number.MAX_SAFE_INTEGER,
          levelOrder[right.level] ?? Number.MAX_SAFE_INTEGER,
          sortDirection,
        ) || compareValues(left.name, right.name, sortDirection);
    }
  });
  const paginatedClasses = paginateItems(sortedClasses, page, pageSize);
  const form = (item?: (typeof classes)[number]) => (
    <form action={item ? updateClassRoom : createClassRoom} className="form-stack">
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <div className="field-grid">
        <label>Nama Kelas<input defaultValue={item?.name} name="name" placeholder="VII-C" required /></label>
        <label>Tingkat<select defaultValue={item?.level ?? "VII"} name="level"><option>VII</option><option>VIII</option><option>IX</option></select></label>
      </div>
      <label>Wali Kelas<input defaultValue={item?.homeroom ?? ""} name="homeroom" placeholder="Nama wali kelas" /></label>
      <div className="form-actions"><ModalCancelButton /><button className={`btn ${item ? "btn-edit" : "btn-save"}`} type="submit">{item ? "Simpan Perubahan" : "Simpan Kelas"}</button></div>
    </form>
  );
  return <main className="page">
    <MasterDataToolbar actions={<Modal title="Tambah Kelas" trigger={<button className="btn btn-create" type="button"><Plus size={17} /> Tambah Kelas</button>}>{form()}</Modal>}>
      <div className="table-toolbar-controls"><TableSearch placeholder="Cari nama kelas, tingkat, atau wali kelas" query={query} /><TablePageSizeSelect pageSize={paginatedClasses.pageSize} pathname="/master/kelas" preserve={{ dir: sortDirection, q: query, sort: sortKey }} /></div>
    </MasterDataToolbar>
    <NoticeFromParams searchParams={searchParams} />
    <section className="panel"><div className="table-wrap"><table><thead><tr><th className="table-number">No</th><SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kelas" pathname="/master/kelas" preserve={{ pageSize: String(pageSize), q: query }} sortKey="name" /><SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tingkat" pathname="/master/kelas" preserve={{ pageSize: String(pageSize), q: query }} sortKey="level" /><SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Wali Kelas" pathname="/master/kelas" preserve={{ pageSize: String(pageSize), q: query }} sortKey="homeroom" /><SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jumlah Siswa" pathname="/master/kelas" preserve={{ pageSize: String(pageSize), q: query }} sortKey="students" /><SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Status" pathname="/master/kelas" preserve={{ pageSize: String(pageSize), q: query }} sortKey="status" /><th className="table-actions">Aksi</th></tr></thead><tbody>
      {paginatedClasses.items.length ? paginatedClasses.items.map((item, index) => <tr key={item.id}><td className="table-number">{paginatedClasses.startItem + index}</td><td><strong>{item.name}</strong></td><td>{item.level}</td><td>{item.homeroom || "-"}</td><td>{item.students.length}</td><td><span className={`badge ${item.active ? "green" : "rose"}`}>{item.active ? "Aktif" : "Nonaktif"}</span></td><td className="table-actions"><div className="table-action-buttons"><Modal title="Ubah Kelas" trigger={<button aria-label="Ubah kelas" className="btn-icon btn-edit" title="Ubah kelas" type="button"><Pencil size={15} /></button>}>{form(item)}</Modal><ConfirmDelete action={deleteClassRoom} id={item.id} label="kelas" /></div></td></tr>) : <tr><td className="empty" colSpan={7}>Data kelas tidak ditemukan.</td></tr>}
    </tbody></table></div><TablePagination currentPage={paginatedClasses.currentPage} endItem={paginatedClasses.endItem} pageSize={paginatedClasses.pageSize} pathname="/master/kelas" preserve={{ dir: sortDirection, q: query, sort: sortKey }} startItem={paginatedClasses.startItem} totalItems={paginatedClasses.totalItems} totalPages={paginatedClasses.totalPages} /></section>
  </main>;
}
