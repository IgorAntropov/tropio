export interface components {
    schemas: {
        IdentityProfile: {
            id: components["schemas"]["Uuid"];
            display_name: string;
            bio: string | null;
            avatar: components["schemas"]["SystemAvatar"] | null;
            csrf_token: string;
        };
        PublicIdentityProfile: {
            id: components["schemas"]["Uuid"];
            display_name: string;
            bio: string | null;
            avatar: components["schemas"]["SystemAvatar"] | null;
        };
        SystemAvatar: {
            id: components["schemas"]["Uuid"];
            url: string;
        };
        SystemAvatarList: {
            items: components["schemas"]["SystemAvatar"][];
        };
        RegisterIdentityRequest: {
            email: string;
            password: string;
            accepted_terms: true;
        };
        LoginIdentityRequest: {
            email: string;
            password: string;
        };
        IdentityEmailRequest: {
            email: string;
        };
        IdentityTokenRequest: {
            token: string;
        };
        ResetIdentityPasswordRequest: {
            token: string;
            password: string;
        };
        UpdateIdentityProfileRequest: {
            display_name?: string;
            bio?: string | null;
        };
        SelectIdentityAvatarRequest: {
            avatar_id: components["schemas"]["Uuid"];
        };
        Uuid: string;
        NullableUuid: components["schemas"]["Uuid"] | null;
        LonLat: {
            lon: number;
            lat: number;
        };
        Position: [
            number,
            number
        ];
        LineString: {
            type: "LineString";
            coordinates: components["schemas"]["Position"][];
        };
        TripTitle: string;
        TripText: string | null;
        TripDifficulty: string | null;
        TripCalendarDate: string | null;
        TripTimezone: string | null;
        TripCapacity: number | null;
        TripEquipment: components["schemas"]["TripEquipmentItem"][];
        TripEquipmentItem: {
            label: string;
            required: boolean;
        };
        CreateTripDraftRequest: {
            title: components["schemas"]["TripTitle"];
            description?: components["schemas"]["TripText"];
            start_date?: components["schemas"]["TripCalendarDate"];
            end_date?: components["schemas"]["TripCalendarDate"];
            timezone?: components["schemas"]["TripTimezone"];
            free_capacity?: components["schemas"]["TripCapacity"];
            difficulty?: components["schemas"]["TripDifficulty"];
            participation_rules?: components["schemas"]["TripText"];
            equipment?: components["schemas"]["TripEquipment"];
        };
        EnsureTripDayRouteRequest: {
            trip_revision_id: components["schemas"]["Uuid"];
        };
        TripDraftSummary: {
            trip_id: components["schemas"]["Uuid"];
            trip_revision_id: components["schemas"]["Uuid"];
            publication_id: components["schemas"]["NullableUuid"];
            visibility: "public" | "private";
            title: components["schemas"]["TripTitle"];
            start_date: components["schemas"]["TripCalendarDate"];
            end_date: components["schemas"]["TripCalendarDate"];
        };
        MyTripDraftList: {
            items: components["schemas"]["TripDraftSummary"][];
            next_cursor: components["schemas"]["NullableUuid"];
        };
        TripDraft: {
            trip_id: components["schemas"]["Uuid"];
            trip_revision_id: components["schemas"]["Uuid"];
            publication_id: components["schemas"]["NullableUuid"];
            visibility: "public" | "private";
            title: components["schemas"]["TripTitle"];
            description: components["schemas"]["TripText"];
            start_date: components["schemas"]["TripCalendarDate"];
            end_date: components["schemas"]["TripCalendarDate"];
            timezone: components["schemas"]["TripTimezone"];
            free_capacity: components["schemas"]["TripCapacity"];
            difficulty: components["schemas"]["TripDifficulty"];
            participation_rules: components["schemas"]["TripText"];
            equipment: components["schemas"]["TripEquipment"];
            days: components["schemas"]["DraftDay"][];
        };
        DraftDay: {
            day_id: components["schemas"]["Uuid"];
            position: number;
            route_id: components["schemas"]["NullableUuid"];
            local_date: components["schemas"]["TripCalendarDate"];
            description: components["schemas"]["TripText"];
            notes: components["schemas"]["TripText"];
        };
        GeoBuildMode: "automatic" | "straight";
        GeoTransportMode: "car" | "bicycle" | "foot";
        ReplaceRouteDraft: {
            route_revision_id: components["schemas"]["NullableUuid"];
            points: components["schemas"]["RoutePointInput"][];
            tracks: components["schemas"]["RouteTrackInput"][];
        };
        RestoreRouteDraft: {
            route_revision_id: components["schemas"]["NullableUuid"];
            target_revision_id: components["schemas"]["Uuid"];
        };
        RoutePointInput: {
            point_id?: components["schemas"]["Uuid"];
            position: components["schemas"]["LonLat"];
            poi_id?: components["schemas"]["Uuid"];
            name?: string;
            description?: string;
        };
        RouteTrackInput: {
            track_id?: components["schemas"]["Uuid"];
            build_mode: components["schemas"]["GeoBuildMode"];
            transport_mode: components["schemas"]["GeoTransportMode"];
            confirm_snap?: {
                from: components["schemas"]["LonLat"];
                to: components["schemas"]["LonLat"];
                graph_version: string;
            };
            name?: string;
            description?: string;
        };
        RouteTrackPreviewRequest: {
            from: components["schemas"]["LonLat"];
            to: components["schemas"]["LonLat"];
            transport_mode: components["schemas"]["GeoTransportMode"];
            build_mode: components["schemas"]["GeoBuildMode"];
        };
        RouteTrackPreview: {
            status: "available" | "unavailable";
            reason?: "no_edge" | "disconnected" | "outside_coverage";
            from: components["schemas"]["RoutePreviewEnd"];
            to: components["schemas"]["RoutePreviewEnd"];
            geometry: components["schemas"]["GeoCoordinates"] | null;
            distance_m: number | null;
            duration_s: number | null;
            provider: string | null;
            graph_version: string | null;
            alternatives: components["schemas"]["RoutePreviewAlternative"][];
            elevation_profile?: components["schemas"]["TrackElevation"];
        };
        GeoCoordinates: [
            number,
            number
        ][];
        RoutePreviewEnd: {
            requested: components["schemas"]["LonLat"];
            snapped: components["schemas"]["LonLat"] | null;
            distance_m: number | null;
        };
        RoutePreviewAlternative: {
            build_mode: components["schemas"]["GeoBuildMode"];
            transport_mode: components["schemas"]["GeoTransportMode"];
            geometry: components["schemas"]["GeoCoordinates"];
            distance_m: number;
            duration_s: number | null;
            connection?: "snapped_finish";
            warning?: "unverified_passability";
        };
        PoiCategories: {
            items: {
                category_id: components["schemas"]["Uuid"];
                code: string;
                label: string;
            }[];
        };
        CreatePoiRequest: {
            category_id: components["schemas"]["Uuid"];
            name: string;
            description?: string | null;
            position: components["schemas"]["LonLat"];
            visibility: "global" | "private" | "trip";
            scope_trip_id?: components["schemas"]["Uuid"];
        };
        RouteDraft: components["schemas"]["ReadableRouteDraft"] | components["schemas"]["RestrictedRouteDraft"];
        ReadableRouteDraft: {
            availability: "available";
            route_id: components["schemas"]["Uuid"];
            route_revision_id: components["schemas"]["NullableUuid"];
            trip_type: "car" | "bicycle" | "foot" | "combined" | null;
            points: components["schemas"]["RoutePoint"][];
            tracks: components["schemas"]["Track"][];
        };
        RestrictedRouteDraft: {
            availability: "geometry_restricted";
            route_id: components["schemas"]["Uuid"];
            route_revision_id: components["schemas"]["Uuid"];
        };
        RoutePoint: {
            point_id: components["schemas"]["Uuid"];
            position: components["schemas"]["LonLat"];
            poi_id?: components["schemas"]["Uuid"];
            requested_position?: components["schemas"]["LonLat"];
            snapped_position?: components["schemas"]["LonLat"];
            name?: string;
            description?: string;
        };
        Track: {
            track_id: components["schemas"]["Uuid"];
            start_point_id: components["schemas"]["Uuid"];
            end_point_id: components["schemas"]["Uuid"];
            geometry: components["schemas"]["LineString"];
            status: "ready" | "needs_rebuild";
            build_mode: components["schemas"]["GeoBuildMode"];
            transport_mode: components["schemas"]["GeoTransportMode"];
            distance_m: number;
            ascent_m: number | null;
            descent_m: number | null;
            min_elevation_m: number | null;
            max_elevation_m: number | null;
            estimated_duration_s?: number;
            routing_provider?: string;
            route_source_version?: string;
            elevation_profile?: components["schemas"]["TrackElevation"];
            name?: string;
            description?: string;
        };
        TrackElevation: {
            ascent_m: number | null;
            descent_m: number | null;
            min_elevation_m: number | null;
            max_elevation_m: number | null;
            profile: {
                distance_m: number;
                elevation_m: number | null;
            }[];
            source: "copernicus-dem-glo-30-public" | null;
            version: string | null;
            covered_distance_m: number;
            vertical_datum: "EGM2008" | null;
            method: string | null;
        };
        SplitCommand: {
            route_id: components["schemas"]["Uuid"];
            route_revision_id: components["schemas"]["Uuid"];
            split_position: components["schemas"]["LonLat"];
        };
        SplitResult: {
            route_id: components["schemas"]["Uuid"];
            route_revision_id: components["schemas"]["Uuid"];
            point_id: components["schemas"]["Uuid"];
            track_ids: components["schemas"]["Uuid"][];
        };
        Poi: {
            poi_id: components["schemas"]["Uuid"];
            category_id: components["schemas"]["Uuid"];
            name: string;
            description?: string;
            position: components["schemas"]["LonLat"];
            poi_revision_id?: components["schemas"]["Uuid"];
            visibility?: "global" | "private" | "trip";
            moderation_status?: "pending" | "approved" | "rejected";
            scope_trip_id?: components["schemas"]["Uuid"];
            media: components["schemas"]["PoiMedia"][];
        };
        PoiMedia: {
            media_id: components["schemas"]["Uuid"];
            href: string;
        };
        PoiPage: {
            items: components["schemas"]["Poi"][];
            next_cursor: string | null;
        };
        Problem: {
            type: string;
            title: string;
            status: number;
            code: string;
            request_id: components["schemas"]["Uuid"];
            current_trip_revision_id?: components["schemas"]["Uuid"];
            current_route_revision_id?: components["schemas"]["Uuid"];
            current_poi_revision_id?: components["schemas"]["Uuid"];
        };
    };
    responses: {
        GeoInvalidRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 400;
                    code?: "INVALID_REQUEST";
                };
            };
        };
        GeoSessionRequired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 401;
                    code?: "SESSION_REQUIRED";
                };
            };
        };
        GeoCsrfRejected: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 403;
                    code?: "CSRF_REJECTED";
                };
            };
        };
        GeoNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 404;
                    code?: "NOT_FOUND";
                };
            };
        };
        GeoRouteConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": (components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "IDEMPOTENCY_KEY_REUSED";
                }) | (components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "ROUTE_REVISION_CONFLICT";
                });
            };
        };
        GeoKeyReused: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "IDEMPOTENCY_KEY_REUSED";
                };
            };
        };
        GeoRouteRejected: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "INVALID_ROUTE_TOPOLOGY";
                }) | (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "ROUTE_BUILD_UNAVAILABLE";
                }) | (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "SNAP_CONFIRMATION_REQUIRED";
                }) | (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "ROUTE_GEOMETRY_RESTRICTED";
                }) | (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "POI_SCOPE_RESTRICTED";
                });
            };
        };
        GeoSplitRejected: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "INVALID_SPLIT_POSITION";
                }) | (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "ROUTE_GEOMETRY_RESTRICTED";
                });
            };
        };
        GeoGeometryRestricted: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "ROUTE_GEOMETRY_RESTRICTED";
                };
            };
        };
        GeoPoiCreationRejected: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "INVALID_POI_CATEGORY";
                }) | (components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "POI_SCOPE_RESTRICTED";
                });
            };
        };
        GeoUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 503;
                    code?: "DEPENDENCY_UNAVAILABLE";
                };
            };
        };
        TravelInvalidRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 400;
                    code?: "INVALID_REQUEST";
                };
            };
        };
        TravelSessionRequired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 401;
                    code?: "SESSION_REQUIRED";
                };
            };
        };
        TravelCsrfRejected: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 403;
                    code?: "CSRF_REJECTED";
                };
            };
        };
        TravelDraftNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 404;
                    code?: "NOT_FOUND";
                };
            };
        };
        TravelKeyReused: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "IDEMPOTENCY_KEY_REUSED";
                };
            };
        };
        TravelWriteConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": (components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "TRIP_REVISION_CONFLICT";
                }) | (components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "IDEMPOTENCY_KEY_REUSED";
                });
            };
        };
        TravelInvalidDates: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "INVALID_TRIP_DATES";
                };
            };
        };
        TravelUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 503;
                    code?: "DEPENDENCY_UNAVAILABLE";
                };
            };
        };
    };
    parameters: {
        IdentityOrigin: string;
        TravelDayId: components["schemas"]["Uuid"];
        MyTripsCursor: components["schemas"]["Uuid"];
        MyTripsLimit: number;
        TripId: components["schemas"]["Uuid"];
        RouteId: components["schemas"]["Uuid"];
        PoiId: components["schemas"]["Uuid"];
        IdempotencyKey: components["schemas"]["Uuid"];
        Bbox: number[];
        Cursor: string;
        Limit: number;
    };
}
export interface operations {
    listMyTripDrafts: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["MyTripsCursor"];
                limit?: components["parameters"]["MyTripsLimit"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyTripDraftList"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    createTripDraft: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateTripDraftRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TripDraft"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            403: components["responses"]["TravelCsrfRejected"];
            409: components["responses"]["TravelKeyReused"];
            422: components["responses"]["TravelInvalidDates"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getTripDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tripId: components["parameters"]["TripId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TripDraft"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            404: components["responses"]["TravelDraftNotFound"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    ensureTripDayRoute: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                dayId: components["parameters"]["TravelDayId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EnsureTripDayRouteRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TripDraft"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            403: components["responses"]["TravelCsrfRejected"];
            404: components["responses"]["TravelDraftNotFound"];
            409: components["responses"]["TravelWriteConflict"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getRouteDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                routeId: components["parameters"]["RouteId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RouteDraft"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            401: components["responses"]["GeoSessionRequired"];
            404: components["responses"]["GeoNotFound"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
    replaceRouteDraft: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                routeId: components["parameters"]["RouteId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReplaceRouteDraft"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadableRouteDraft"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            401: components["responses"]["GeoSessionRequired"];
            403: components["responses"]["GeoCsrfRejected"];
            404: components["responses"]["GeoNotFound"];
            409: components["responses"]["GeoRouteConflict"];
            422: components["responses"]["GeoRouteRejected"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
    previewRouteTrack: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RouteTrackPreviewRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RouteTrackPreview"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            401: components["responses"]["GeoSessionRequired"];
            403: components["responses"]["GeoCsrfRejected"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
    splitTrack: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                trackId: components["schemas"]["Uuid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SplitCommand"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SplitResult"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            401: components["responses"]["GeoSessionRequired"];
            403: components["responses"]["GeoCsrfRejected"];
            404: components["responses"]["GeoNotFound"];
            409: components["responses"]["GeoRouteConflict"];
            422: components["responses"]["GeoSplitRejected"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
    restoreRouteDraft: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                routeId: components["parameters"]["RouteId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RestoreRouteDraft"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadableRouteDraft"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            401: components["responses"]["GeoSessionRequired"];
            403: components["responses"]["GeoCsrfRejected"];
            404: components["responses"]["GeoNotFound"];
            409: components["responses"]["GeoRouteConflict"];
            422: components["responses"]["GeoGeometryRestricted"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
    listPoiCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoiCategories"];
                };
            };
            503: components["responses"]["GeoUnavailable"];
        };
    };
    listPois: {
        parameters: {
            query: {
                scope: "global" | "mine" | "trip";
                trip_id?: components["schemas"]["Uuid"];
                q?: string;
                bbox?: components["parameters"]["Bbox"];
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoiPage"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            401: components["responses"]["GeoSessionRequired"];
            404: components["responses"]["GeoNotFound"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
    getPoi: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                poiId: components["parameters"]["PoiId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Poi"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            404: components["responses"]["GeoNotFound"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
    createPoi: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePoiRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Poi"];
                };
            };
            400: components["responses"]["GeoInvalidRequest"];
            401: components["responses"]["GeoSessionRequired"];
            403: components["responses"]["GeoCsrfRejected"];
            404: components["responses"]["GeoNotFound"];
            409: components["responses"]["GeoKeyReused"];
            422: components["responses"]["GeoPoiCreationRejected"];
            503: components["responses"]["GeoUnavailable"];
        };
    };
}
