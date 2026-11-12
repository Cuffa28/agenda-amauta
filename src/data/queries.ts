import { queryOptions } from "@tanstack/react-query";

import { getRepository } from "./index";

export const advisorsQuery = () =>
  queryOptions({ queryKey: ["advisors"], queryFn: () => getRepository().listAdvisors() });
export const clientsQuery = () =>
  queryOptions({ queryKey: ["clients"], queryFn: () => getRepository().listClients() });
export const positionsQuery = () =>
  queryOptions({ queryKey: ["positions"], queryFn: () => getRepository().listPositions() });
export const reviewsQuery = () =>
  queryOptions({ queryKey: ["reviews"], queryFn: () => getRepository().listReviews() });
export const pendingsQuery = () =>
  queryOptions({ queryKey: ["pendings"], queryFn: () => getRepository().listPendings() });
export const marketViewQuery = () =>
  queryOptions({ queryKey: ["market-view"], queryFn: () => getRepository().getMarketView() });
export const draftsQuery = () =>
  queryOptions({ queryKey: ["drafts"], queryFn: () => getRepository().listEmailDrafts() });
export const followUpsQuery = () =>
  queryOptions({ queryKey: ["follow-ups"], queryFn: () => getRepository().listFollowUps() });

