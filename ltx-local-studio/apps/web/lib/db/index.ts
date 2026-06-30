import Dexie, { type Table } from "dexie";
import type { Project, Shot, Asset, Generation } from "@ltx-studio/shared-types";

interface AssetBlob {
  id: string;
  blob: Blob;
}

class StudioDatabase extends Dexie {
  projects!: Table<Project>;
  shots!: Table<Shot>;
  assets!: Table<Asset>;
  assetBlobs!: Table<AssetBlob>;
  generations!: Table<Generation>;

  constructor() {
    super("ltx-local-studio");
    this.version(1).stores({
      projects: "id, updatedAt",
      shots: "id, projectId, order",
      assets: "id, projectId, kind, role",
      assetBlobs: "id",
      generations: "id, shotId, status, createdAt",
    });
  }
}

let _db: StudioDatabase | null = null;

export function getDb(): StudioDatabase {
  if (!_db) _db = new StudioDatabase();
  return _db;
}

export type { StudioDatabase };
