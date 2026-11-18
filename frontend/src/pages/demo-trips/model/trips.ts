export interface DemoTrip {
  slug: string
  title: string
  region: string
  distanceKm: number
  duration: string
  summary: string
  stops: readonly string[]
}

export const demoTrips: readonly DemoTrip[] = [
  {
    slug: 'katun-terraces',
    title: 'Террасы над Катунью',
    region: 'Алтай',
    distanceKm: 18,
    duration: '2 дня',
    summary: 'Двухдневная прогулка от речной долины к обзорной поляне.',
    stops: ['Сосновый берег', 'Верхняя терраса', 'Обзорная поляна'],
  },
  {
    slug: 'quiet-bays',
    title: 'По тихим бухтам',
    region: 'Карелия',
    distanceKm: 12,
    duration: '1 день',
    summary: 'Короткий маршрут вдоль воды с остановкой у гранитного мыса.',
    stops: ['Лесная пристань', 'Гранитный мыс', 'Тихая бухта'],
  },
  {
    slug: 'steppe-ridge',
    title: 'Вдоль степного хребта',
    region: 'Хакасия',
    distanceKm: 24,
    duration: '2 дня',
    summary: 'Маршрут по открытым склонам с видом на долину и выходом к озеру.',
    stops: ['Степная тропа', 'Восточный гребень', 'Озёрный берег'],
  },
]
