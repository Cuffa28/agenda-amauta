import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getRepository } from "./index";
import type { AgendaRepository } from "./repository";

export function useRepoMutation<TVars, TResult>(
  fn: (repo: AgendaRepository, vars: TVars) => Promise<TResult>,
  options: { success?: string; invalidate?: string[]; onSuccess?: (result: TResult) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(getRepository(), vars),
    onSuccess: (result) => {
      options.onSuccess?.(result);
      if (options.success) toast.success(options.success);
      // La respuesta ya confirmada se muestra sin esperar consultas ajenas al guardado.
      void (options.invalidate
        ? Promise.all(options.invalidate.map(key => queryClient.invalidateQueries({ queryKey: [key] })))
        : queryClient.invalidateQueries());
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Error inesperado"),
  });
}

