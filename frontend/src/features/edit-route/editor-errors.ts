import {
  EditorResponseError,
  IdentityResponseError,
} from '@fsd/shared/api';

const editorProblems: Record<string, string> = {
  INVALID_REQUEST: 'Проверь координаты и параметры маршрута.',
  SESSION_REQUIRED: 'Сессия закончилась. Войди снова, чтобы сохранить правки.',
  CSRF_REJECTED: 'Обнови сессию и повтори действие.',
  NOT_FOUND: 'Объект удалён или тебе закрыли доступ.',
  ROUTE_REVISION_CONFLICT: 'Маршрут уже изменился на сервере. Открой актуальную версию или сравни варианты.',
  TRIP_REVISION_CONFLICT: 'Путешествие изменилось. Открой актуальную программу и повтори действие.',
  IDEMPOTENCY_KEY_REUSED: 'Ключ сохранения уже использован. Проверь актуальную версию.',
  INVALID_ROUTE_TOPOLOGY: 'Проверь порядок и координаты точек. У соседних треков должна быть общая точка.',
  ROUTE_BUILD_UNAVAILABLE: 'Трек нельзя построить по выбранной сети. Выбери другой способ или транспорт.',
  SNAP_CONFIRMATION_REQUIRED: 'Дорожная привязка изменилась. Рассчитай и подтверди её снова.',
  INVALID_SPLIT_POSITION: 'Выбери точку на треке. После деления длина каждой части должна быть не меньше метра.',
  ROUTE_GEOMETRY_RESTRICTED: 'Доступ к связанной точке интереса изменился. Открой актуальную версию маршрута.',
  POI_SCOPE_RESTRICTED: 'Точка интереса недоступна для этого путешествия.',
  POI_REVISION_CONFLICT: 'Точка интереса изменилась. Открой актуальную версию.',
  INVALID_POI_CATEGORY: 'Обнови список категорий и выбери доступную.',
  INVALID_TRIP_DATES: 'Проверь даты путешествия.',
  DEPENDENCY_UNAVAILABLE: 'Сервис временно недоступен. Повтори попытку.',
};

export function editorProblemCode(error: unknown) {
  return error instanceof EditorResponseError || error instanceof IdentityResponseError ? error.code : '';
}

export function describeEditorError(error: unknown) {
  const code = editorProblemCode(error);
  if (code) {
    return editorProblems[code] ?? 'Не удалось выполнить действие. Попробуй ещё раз.';
  }
  if (error instanceof TypeError) {
    return 'Проверь подключение к сети и повтори попытку.';
  }
  if (error instanceof EditorResponseError && error.status >= 500) {
    return editorProblems.DEPENDENCY_UNAVAILABLE!;
  }
  return 'Не удалось выполнить действие. Попробуй ещё раз.';
}

export function routeErrorState(error: unknown): 'offline' | 'conflict' | 'error' {
  if (error instanceof TypeError) {
    return 'offline';
  }
  return editorProblemCode(error) === 'ROUTE_REVISION_CONFLICT' ? 'conflict' : 'error';
}
