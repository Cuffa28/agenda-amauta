import { useQueryClient } from "@tanstack/react-query";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { BOARD_STAGES, BOARD_LABELS, type BoardEntry, type BoardStage } from "@/domain/board";
export function useBoardMove(month: string) {
  const cache = useQueryClient();
  return useRepoMutation(
    (repo, input: { clientId: string; stage: BoardStage; entry?: BoardEntry | undefined }) =>
      repo.moveBoardEntry({
        clientId: input.clientId,
        month,
        stage: input.stage,
        expectedUpdatedAt: input.entry?.updatedAt,
      }),
    {
      success: "Estado guardado",
      invalidate: [],
      onSuccess: (entry) =>
        cache.setQueryData<BoardEntry[]>(["board", month], (old) => [
          entry,
          ...(old || []).filter((e) => e.clientId !== entry.clientId),
        ]),
    },
  );
}
export function BoardStageSelect({
  value,
  disabled,
  onChange,
  label = "Estado de la tarjeta",
}: {
  value: BoardStage;
  disabled?: boolean;
  onChange: (value: BoardStage) => void;
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      className="max-w-full rounded-lg border bg-background px-2 py-1.5 text-xs"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as BoardStage)}
    >
      {BOARD_STAGES.map((s) => (
        <option key={s} value={s}>
          {BOARD_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
