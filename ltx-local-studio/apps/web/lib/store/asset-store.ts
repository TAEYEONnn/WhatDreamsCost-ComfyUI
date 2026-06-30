import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Asset, AssetKind, AssetRole } from "@ltx-studio/shared-types";
import { getDb } from "../db";

interface AssetState {
  assets: Asset[];
  loadAssets: (projectId: string) => Promise<void>;
  uploadAsset: (projectId: string, file: File, role?: AssetRole) => Promise<Asset>;
  updateAsset: (id: string, changes: Partial<Pick<Asset, "name" | "role">>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  getBlobUrl: (assetId: string) => Promise<string | null>;
}

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
]);

function mimeToKind(mime: string): AssetKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  throw new Error(`지원하지 않는 파일 형식입니다: ${mime}`);
}

export const useAssetStore = create<AssetState>((set) => ({
  assets: [],

  loadAssets: async (projectId) => {
    const db = getDb();
    const assets = await db.assets.where("projectId").equals(projectId).toArray();
    set({ assets });
  },

  uploadAsset: async (projectId, file, role = "reference") => {
    if (!ALLOWED_MIMES.has(file.type)) {
      throw new Error(
        `지원하지 않는 파일 형식입니다. 허용: PNG, JPEG, WebP, MP4, WebM, MP3, WAV, OGG`
      );
    }
    const kind = mimeToKind(file.type);
    const asset: Asset = {
      id: uuidv4(),
      projectId,
      name: file.name,
      kind,
      role,
      mimeType: file.type,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
    };
    const db = getDb();
    await db.transaction("rw", [db.assets, db.assetBlobs], async () => {
      await db.assets.add(asset);
      await db.assetBlobs.put({ id: asset.id, blob: file });
    });
    set((s) => ({ assets: [asset, ...s.assets] }));
    return asset;
  },

  updateAsset: async (id, changes) => {
    const db = getDb();
    await db.assets.update(id, changes);
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...changes } : a)),
    }));
  },

  deleteAsset: async (id) => {
    const db = getDb();
    await db.transaction("rw", [db.assets, db.assetBlobs], async () => {
      await db.assets.delete(id);
      await db.assetBlobs.delete(id);
    });
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
  },

  getBlobUrl: async (assetId) => {
    const db = getDb();
    const entry = await db.assetBlobs.get(assetId);
    if (!entry) return null;
    return URL.createObjectURL(entry.blob);
  },
}));
