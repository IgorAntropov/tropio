import { useI18n } from 'vue-i18n'
import type { EditorPosition, EditorTrack } from '../types'

const messages = {
  ru: {
    map: 'Карта',
    scheme: 'Схема',
    mapScheme: 'Вид редактора',
    back: 'К путешествию',
    route: 'Маршрут',
    dayNavigation: 'Дни маршрута',
    tools: 'Инструменты карты',
    segmentMode: 'Построение',
    position: 'Положение',
    rename: 'Название',
    description: 'Описание',
    transport: 'Транспорт',
    car: 'Автомобиль',
    bicycle: 'Велосипед',
    foot: 'Пешком',
    combined: 'Комбинированный',
    automatic: 'По дорогам и тропам',
    automaticShort: 'Автомаршрут',
    straight: 'Прямой',
    view: 'Просмотр карты',
    draw: 'Построение маршрута',
    poi: 'Добавить POI',
    undo: 'Отменить действие',
    redo: 'Повторить действие',
    clearRoute: 'Очистить маршрут',
    editTimeline: 'Открыть детали · {name}',
    splitHint: 'Укажи место деления на треке',
    moveHint: 'Укажи новое положение точки',
    drawStart: 'Укажи первую точку на карте',
    drawNext: 'Укажи следующую точку',
    poiHint: 'Укажи место для POI',
    empty: 'Маршрут пока пуст',
    emptyHelp: 'В режиме построения укажи первую точку на карте.',
    readonlyEmpty: 'Геометрия маршрута недоступна',
    openMap: 'Открыть карту',
    loading: 'Загружаем маршрут…',
    calculating: 'Рассчитываем трек…',
    idle: 'Черновик',
    saving: 'Сохраняем…',
    saved: 'Сохранено',
    offline: 'Нет сети · не сохранено',
    conflict: 'Конфликт версий',
    error: 'Не сохранено',
    retry: 'Повторить',
    signInNewTab: 'Войти в новой вкладке',
    compare: 'Сравнить версии',
    local: 'Мои правки',
    server: 'На сервере',
    keepLocal: 'К моим правкам',
    useServer: 'Открыть актуальную версию',
    loadingServer: 'Загружаем актуальную версию…',
    failedServer: 'Не удалось загрузить актуальную версию.',
    comparisonHelp: 'Открой актуальную версию и повтори нужные правки вручную.',
    compareTabs: 'Версии маршрута',
    point: 'Точка {number}',
    track: 'Трек {number}',
    trackBetween: '{from} — {to}',
    needsRebuild: 'Требует пересчёта',
    editPoint: 'Редактирование точки',
    editTrack: 'Редактирование трека',
    split: 'Разделить трек',
    move: 'Перенести на карте',
    remove: 'Удалить точку',
    removeConfirm: 'Удалить точку?',
    removePointImpact: 'Точка будет удалена из маршрута. Если она соединяет два трека, они объединятся в один.',
    editPosition: 'Изменить координаты',
    linkedPoi: 'Положение связано с POI.',
    latitude: 'Широта',
    longitude: 'Долгота',
    invalidLatitude: 'Укажи широту от −90 до 90.',
    invalidLongitude: 'Укажи долготу от −180 до 180.',
    invalidText: 'Удали недопустимые символы.',
    nameTooLong: 'Название может содержать до 120 символов.',
    descriptionTooLong: 'Описание может содержать до 4000 символов.',
    save: 'Сохранить',
    cancel: 'Отмена',
    close: 'Закрыть',
    previewAvailable: 'Варианты построения',
    previewUnavailable: 'Маршрут не построен',
    noEdge: 'Рядом с точкой нет доступной дороги или тропы.',
    disconnected: 'Между точками нет связного пути для этого транспорта.',
    outsideCoverage: 'Точка находится за пределами области автоматического расчёта.',
    proposedStart: 'Начало',
    proposedFinish: 'Конец',
    requested: 'На карте',
    snapped: 'На дороге',
    shift: 'Смещение {distance}',
    accept: 'Принять привязку',
    acceptUnbuilt: 'Сохранить · нужен пересчёт',
    optionManual: 'Построить прямой трек',
    optionWalk: 'Пеший маршрут',
    connectionManual: 'Продолжить прямым треком',
    connectionWalk: 'Продолжить пешком',
    warning: 'Проходимость не проверена',
    elevation: 'Набор {up} · сброс {down}',
    createPoi: 'Добавить POI',
    poiCategory: 'Категория',
    poiCategoryPlaceholder: 'Выбрать категорию',
    poiScope: 'Доступно в этом путешествии',
    poiNameError: 'Укажи название места.',
    poiCategoryError: 'Выбери категорию места.',
    media: 'Фотографии',
    photo: 'Фото {number}',
    previousPhoto: 'Предыдущее фото',
    nextPhoto: 'Следующее фото',
    photoCount: '{current} из {total}',
    openDay: 'Вперёд',
    previousDay: 'Назад',
  },
}

export function useEditorCopy() {
  return useI18n({ useScope: 'local', messages })
}

export const transportIcons = {
  car: 'directions_car',
  bicycle: 'pedal_bike',
  foot: 'directions_walk',
} as const

export function coordinateLabel({ lat, lon }: EditorPosition) {
  return `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`
}

export function routeDistance(tracks: readonly EditorTrack[]) {
  return tracks.reduce((sum, track) => sum + (track.distance_m ?? 0), 0)
}

const distanceKilometers = new Intl.NumberFormat('ru', { style: 'unit', unit: 'kilometer', unitDisplay: 'short', maximumFractionDigits: 2 })
const distanceMeters = new Intl.NumberFormat('ru', { style: 'unit', unit: 'meter', unitDisplay: 'short', maximumFractionDigits: 0 })

export function distanceLabel(distance: number) {
  return distance >= 1000 ? distanceKilometers.format(distance / 1000) : distanceMeters.format(distance)
}
