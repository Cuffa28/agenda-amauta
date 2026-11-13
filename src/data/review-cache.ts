import type { QueryClient } from '@tanstack/react-query';
import type { Review } from '@/domain/schemas';

/** Usa la respuesta persistida; no espera a volver a descargar toda la agenda. */
export function cacheSavedReview(client: QueryClient, review: Review) {
  for (const key of [['reviews'], ['reviews', review.clientId]]) {
    client.setQueryData<Review[]>(key, old => old
      ? [review, ...old.filter(row => row.id !== review.id)]
      : undefined);
  }
}

export function removeCancelledReview(client: QueryClient, review: Review) {
  for (const key of [['reviews'], ['reviews', review.clientId]]) {
    client.setQueryData<Review[]>(key, old => old?.filter(row => row.id !== review.id));
  }
}
