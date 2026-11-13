import { queryOptions } from "@tanstack/react-query";

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

