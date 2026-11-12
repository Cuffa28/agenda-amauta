import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getRepository } from "./index";
import type { AgendaRepository } from "./repository";

export function useRepoMutation<TVars, TResult>(
  fn: (repo: AgendaRepository, vars: TVars) => Promise<TResult>,
  options: { success?: string; onSuccess?: (result: TResult) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(getRepository(), vars),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      if (options.success) toast.success(options.success);
      options.onSuccess?.(result);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Error inesperado"),
  });
}

