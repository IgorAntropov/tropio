export function tripDraftPath(tripId: string) {
  return `/trips/${tripId}`
}

export function dayRoutePath(tripId: string, dayId: string) {
  return `${tripDraftPath(tripId)}/days/${dayId}/route`
}
