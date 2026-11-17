import { queryOptions } from "@tanstack/react-query";

import { todayInBuenosAires } from "@/domain/dates";
import { applyPauses } from "@/domain/pause";
import { getRepository } from "./index";

export const advisorsQuery = () =>
  queryOptions({ queryKey: ["advisors"], queryFn: () => getRepository().listAdvisors() });
export const clientsQuery = () =>
  queryOptions({ queryKey: ["clients"], queryFn: () => getRepository().listClients() });
export const positionsQuery = (clientId?: string) =>
  queryOptions({ queryKey: clientId ? ["positions", clientId] : ["positions"], queryFn: () => getRepository().listPositions(clientId) });
export const reviewsQuery = (clientId?: string) =>
  queryOptions({ queryKey: clientId ? ["reviews", clientId] : ["reviews"], queryFn: () => getRepository().listReviews(clientId) });
export const pendingsQuery = (clientId?: string) =>
  queryOptions({ queryKey: clientId ? ["pendings", clientId] : ["pendings"], queryFn: () => getRepository().listPendings(clientId) });
export const marketViewQuery = () =>
  queryOptions({ queryKey: ["market-view"], queryFn: () => getRepository().getMarketView() });
export const draftsQuery = (clientId?: string) =>
  queryOptions({ queryKey: clientId ? ["drafts", clientId] : ["drafts"], queryFn: () => getRepository().listEmailDrafts(clientId) });
export const followUpsQuery = () =>
  queryOptions({ queryKey: ["follow-ups"], queryFn: () => getRepository().listFollowUps() });


export const tasksQuery = () =>
  queryOptions({ queryKey: ["tasks"], queryFn: () => getRepository().listTasks() });
export const recommendationsQuery = () =>
  queryOptions({
    queryKey: ["recommendations"],
    queryFn: () => getRepository().listRecommendationRecords(),
  });
export const pausesQuery = () =>
  queryOptions({ queryKey: ["pauses"], queryFn: () => getRepository().listPauses() });
/** Avance del mes con las pausas vigentes ya aplicadas (sobreviven al cambio de mes). */
export const boardQuery = (month: string) =>
  queryOptions({
    queryKey: ["board", month],
    queryFn: async () => {
      const repo = getRepository();
      const [entries, pauses] = await Promise.all([repo.listBoardEntries(month), repo.listPauses()]);
      return applyPauses(entries, pauses, month, todayInBuenosAires());
    },
  });
