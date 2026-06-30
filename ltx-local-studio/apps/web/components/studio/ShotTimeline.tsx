"use client";
import { useCallback } from "react";
import { useShotStore } from "@/lib/store/shot-store";
import { useGenerationStore } from "@/lib/store/generation-store";
import type { Shot } from "@ltx-studio/shared-types";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ShotTimelineProps {
  projectId: string | null;
}

export function ShotTimeline({ projectId }: ShotTimelineProps) {
  const { shots, activeShotId, createShot, deleteShot, duplicateShot, setActiveShot, reorderShots } =
    useShotStore();
  const { generations } = useGenerationStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const projectShots = shots
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => a.order - b.order);

  const handleAddShot = useCallback(async () => {
    if (!projectId) return;
    await createShot(projectId);
  }, [projectId, createShot]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !projectId) return;
      const oldIndex = projectShots.findIndex((s) => s.id === active.id);
      const newIndex = projectShots.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(projectShots, oldIndex, newIndex);
      await reorderShots(
        projectId,
        reordered.map((s) => s.id)
      );
    },
    [projectShots, projectId, reorderShots]
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
      <SortableContext items={projectShots.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto h-full">
          {projectShots.map((shot) => (
            <SortableShotCard
              key={shot.id}
              shot={shot}
              isActive={shot.id === activeShotId}
              latestStatus={generations.find((g) => g.shotId === shot.id)?.status}
              latestProgress={generations.find((g) => g.shotId === shot.id)?.progress}
              onClick={() => setActiveShot(shot.id)}
              onDuplicate={() => void duplicateShot(shot.id)}
              onDelete={() => void deleteShot(shot.id)}
            />
          ))}
          {projectId && (
            <button
              onClick={() => void handleAddShot()}
              className="shrink-0 w-24 h-[calc(100%-8px)] border border-dashed border-[#222] rounded flex items-center justify-center text-[#333] hover:text-[#666] hover:border-[#333] transition-colors text-lg"
            >
              +
            </button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableShotCardProps {
  shot: Shot;
  isActive: boolean;
  latestStatus?: string;
  latestProgress?: number;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function SortableShotCard(props: SortableShotCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.shot.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ShotCard {...props} dragListeners={listeners} />
    </div>
  );
}

interface ShotCardProps extends SortableShotCardProps {
  dragListeners?: Record<string, unknown>;
}

function ShotCard({
  shot,
  isActive,
  latestStatus,
  latestProgress,
  onClick,
  onDuplicate,
  onDelete,
  dragListeners,
}: ShotCardProps) {
  const statusColor =
    latestStatus === "completed"
      ? "bg-green-600"
      : latestStatus === "failed"
      ? "bg-red-600"
      : latestStatus === "processing"
      ? "bg-yellow-500"
      : latestStatus === "queued"
      ? "bg-blue-600"
      : "bg-[#222]";

  return (
    <div
      onClick={onClick}
      className={`shrink-0 w-28 h-[calc(100%-8px)] rounded border cursor-pointer transition-all flex flex-col overflow-hidden group relative ${
        isActive
          ? "border-blue-500 bg-[#0d1a33]"
          : "border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#2a2a2a]"
      }`}
    >
      {/* Drag handle */}
      <div
        {...dragListeners}
        className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 text-[#444] hover:text-[#888] text-[10px] cursor-grab active:cursor-grabbing select-none px-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </div>

      <div className="flex-1 flex items-center justify-center p-2">
        <span className="text-[#333] text-lg">▶</span>
      </div>
      <div className="px-2 pb-1.5">
        <div className="text-[10px] text-[#888] truncate">{shot.name}</div>
        <div className="text-[9px] text-[#444]">{shot.durationSeconds}초</div>
        {latestStatus === "processing" && typeof latestProgress === "number" && (
          <div className="mt-1 w-full h-0.5 bg-[#1a1a1a] rounded overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${latestProgress}%` }} />
          </div>
        )}
      </div>
      <div className={`h-0.5 w-full ${statusColor} transition-colors`} />

      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="text-[9px] text-[#666] hover:text-white bg-[#0a0a0a] rounded px-1"
          title="복제"
        >
          ⊕
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-[9px] text-[#666] hover:text-red-400 bg-[#0a0a0a] rounded px-1"
          title="삭제"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
