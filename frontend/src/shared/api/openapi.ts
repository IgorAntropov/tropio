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
        TripAdmissionMode: "request" | "open";
        TripDifficulty: string | null;
        TripCalendarDate: string | null;
        TripTimezone: string | null;
        TripCapacity: number | null;
        TripCoverUpload: {
            content_type: "image/jpeg" | "image/png" | "image/webp";
            data_base64: string;
        } | null;
        EquipmentLibrary: {
            categories: {
                id: components["schemas"]["EquipmentCategoryId"];
                label: string;
                group: string;
            }[];
            items: components["schemas"]["EquipmentLibraryItem"][];
        };
        EquipmentCategoryId: "documents" | "clothing" | "hygiene" | "health" | "electronics" | "bags" | "food" | "orientation" | "camp" | "cooking" | "hiking" | "cycling" | "car" | "water" | "winter" | "city" | "family" | "other";
        PersonalEquipmentGroup: {
            id: components["schemas"]["Uuid"];
            label: string;
        };
        PersonalEquipmentGroupReference: {
            id: components["schemas"]["Uuid"];
        } | {
            label: string;
        };
        EquipmentLibraryItem: {
            id: components["schemas"]["Uuid"];
            label: string;
            scope: "system" | "personal";
            category: components["schemas"]["EquipmentCategoryId"];
            group?: components["schemas"]["PersonalEquipmentGroup"];
            subgroup?: components["schemas"]["PersonalEquipmentGroup"];
            icon?: components["schemas"]["EquipmentCategoryId"];
            code?: string;
            carry_scope?: "personal" | "group";
            travel_types?: string[];
            condition?: string | null;
            unit?: "pcs";
            is_active?: boolean;
        };
        CreatePersonalEquipmentRequest: {
            label: string;
            scope?: "personal";
            group?: components["schemas"]["PersonalEquipmentGroupReference"];
            subgroup?: components["schemas"]["PersonalEquipmentGroupReference"];
            icon?: components["schemas"]["EquipmentCategoryId"];
        };
        TripEquipment: components["schemas"]["TripEquipmentItem"][];
        TripEquipmentItem: {
            label: string;
            required: boolean;
        };
        CreateTripDraftRequest: {
            admission_mode?: components["schemas"]["TripAdmissionMode"];
            title: components["schemas"]["TripTitle"];
            description?: components["schemas"]["TripText"];
            start_date?: components["schemas"]["TripCalendarDate"];
            end_date?: components["schemas"]["TripCalendarDate"];
            timezone?: components["schemas"]["TripTimezone"];
            free_capacity?: components["schemas"]["TripCapacity"];
            difficulty?: components["schemas"]["TripDifficulty"];
            participation_rules?: components["schemas"]["TripText"];
            equipment?: components["schemas"]["TripEquipment"];
            cover?: components["schemas"]["TripCoverUpload"];
        };
        UpdateTripDraftRequest: {
            trip_revision_id: components["schemas"]["Uuid"];
            shift_day_dates?: boolean;
            visibility?: "public" | "private";
            admission_mode?: components["schemas"]["TripAdmissionMode"];
            title?: components["schemas"]["TripTitle"];
            description?: components["schemas"]["TripText"];
            start_date?: components["schemas"]["TripCalendarDate"];
            end_date?: components["schemas"]["TripCalendarDate"];
            timezone?: components["schemas"]["TripTimezone"];
            free_capacity?: components["schemas"]["TripCapacity"];
            difficulty?: components["schemas"]["TripDifficulty"];
            participation_rules?: components["schemas"]["TripText"];
            equipment?: components["schemas"]["TripEquipment"];
            cover?: components["schemas"]["TripCoverUpload"];
        };
        EnsureTripDayRouteRequest: {
            trip_revision_id: components["schemas"]["Uuid"];
        };
        TripDraftSummary: {
            cover_id?: components["schemas"]["NullableUuid"];
            trip_id: components["schemas"]["Uuid"];
            trip_revision_id: components["schemas"]["Uuid"];
            publication_id: components["schemas"]["NullableUuid"];
            visibility: "public" | "private";
            admission_mode: components["schemas"]["TripAdmissionMode"];
            title: components["schemas"]["TripTitle"];
            start_date: components["schemas"]["TripCalendarDate"];
            end_date: components["schemas"]["TripCalendarDate"];
        };
        MyTripDraftList: {
            items: components["schemas"]["TripDraftSummary"][];
            next_cursor: components["schemas"]["NullableUuid"];
        };
        TripDraft: {
            cover_id?: components["schemas"]["NullableUuid"];
            published_manifest?: {
                trip_revision_id: components["schemas"]["Uuid"];
                routes: components["schemas"]["PublishRoute"][];
                poi_count: number;
            };
            trip_id: components["schemas"]["Uuid"];
            trip_revision_id: components["schemas"]["Uuid"];
            publication_id: components["schemas"]["NullableUuid"];
            admission_mode: components["schemas"]["TripAdmissionMode"];
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
        PublishCommand: {
            trip_revision_id: components["schemas"]["Uuid"];
            routes: components["schemas"]["PublishRoute"][];
            poi_ids: components["schemas"]["Uuid"][];
        };
        PublishRoute: {
            day_id: components["schemas"]["Uuid"];
            route_id: components["schemas"]["Uuid"];
            route_revision_id: components["schemas"]["Uuid"];
        };
        PublicationPending: {
            operation_id: components["schemas"]["Uuid"];
            status: "pending";
        };
        PublicationSucceeded: {
            operation_id: components["schemas"]["Uuid"];
            status: "succeeded";
            publication_id: components["schemas"]["Uuid"];
            trip_revision_id: components["schemas"]["Uuid"];
        };
        PublicationFailed: {
            operation_id: components["schemas"]["Uuid"];
            status: "failed";
            code: "TRIP_REVISION_CONFLICT" | "ROUTE_REVISION_CONFLICT" | "ROUTE_NOT_READY" | "POI_PUBLICATION_RESTRICTED" | "PUBLICATION_PRECONDITION_FAILED" | "PUBLICATION_CANCELLED" | "PUBLICATION_TIMED_OUT";
        };
        PublicationTerminal: components["schemas"]["PublicationSucceeded"] | components["schemas"]["PublicationFailed"];
        PublicationOperation: components["schemas"]["PublicationPending"] | components["schemas"]["PublicationSucceeded"] | components["schemas"]["PublicationFailed"];
        UnpublishCommand: {
            trip_revision_id: components["schemas"]["Uuid"];
            publication_id: components["schemas"]["NullableUuid"];
        };
        UnpublishResult: {
            publication_id: null;
            trip_revision_id: components["schemas"]["Uuid"];
        };
        PublicOrganizer: {
            id: components["schemas"]["Uuid"];
            display_name: string;
            avatar: components["schemas"]["SystemAvatar"] | null;
        };
        TripRoster: {
            viewer_id: components["schemas"]["Uuid"];
            can_manage: boolean;
            can_accept: boolean;
            occupied_slots: number;
            capacity: components["schemas"]["TripCapacity"];
            items: {
                id: components["schemas"]["Uuid"];
                user_id: components["schemas"]["Uuid"];
                status: "pending" | "joined";
                profile: components["schemas"]["PublicOrganizer"] | null;
            }[];
        };
        TripFavoriteState: {
            viewer_id: components["schemas"]["Uuid"];
            saved: boolean;
        };
        AccountTripPage: {
            viewer_id: components["schemas"]["Uuid"];
            items: components["schemas"]["AccountTripCard"][];
            next_cursor: string | null;
        };
        AccountTripCard: {
            route_count: number;
            total_distance_m: number | null;
            trip_id: components["schemas"]["Uuid"];
            publication_id: string | null;
            cover_id: string | null;
            organizer: components["schemas"]["PublicOrganizer"] | null;
            title: string;
            description: string;
            start_date: components["schemas"]["TripCalendarDate"];
            end_date: components["schemas"]["TripCalendarDate"];
            day_count: number;
            difficulty: components["schemas"]["TripDifficulty"];
            free_capacity: components["schemas"]["TripCapacity"];
            confirmed_participants: number;
            lifecycle: "planned" | "in_progress" | "completed" | "cancelled";
            trip_type: "foot" | "bicycle" | "car" | "combined" | null;
            archived: boolean;
            is_owner: boolean;
            starting_soon: boolean;
            pending_count: number;
            participation_status: "pending" | "joined" | null;
            saved: boolean;
        };
        PublicTripSummary: {
            route_count: number;
            total_distance_m: number;
            cover_id?: components["schemas"]["NullableUuid"];
            organizer: components["schemas"]["PublicOrganizer"] | null;
            distance_m?: number;
            trip_id: components["schemas"]["Uuid"];
            publication_id: components["schemas"]["Uuid"];
            admission_mode: components["schemas"]["TripAdmissionMode"];
            title: string;
            start_date: components["schemas"]["TripCalendarDate"];
            end_date: components["schemas"]["TripCalendarDate"];
            difficulty: components["schemas"]["TripDifficulty"];
            free_capacity: components["schemas"]["TripCapacity"];
            trip_type: "foot" | "bicycle" | "car" | "combined" | null;
            day_count: number;
            confirmed_participants: number;
            applications_open: boolean;
            lifecycle: "planned" | "in_progress" | "completed" | "cancelled";
            description: string;
            start: components["schemas"]["LonLat"];
        };
        PublicTrip: {
            route_count: number;
            total_distance_m: number;
            cover_id?: components["schemas"]["NullableUuid"];
            equipment?: components["schemas"]["TripEquipment"];
            organizer: components["schemas"]["PublicOrganizer"] | null;
            trip_id: components["schemas"]["Uuid"];
            publication_id: components["schemas"]["Uuid"];
            admission_mode: components["schemas"]["TripAdmissionMode"];
            title: string;
            start_date: components["schemas"]["TripCalendarDate"];
            end_date: components["schemas"]["TripCalendarDate"];
            difficulty: components["schemas"]["TripDifficulty"];
            free_capacity: components["schemas"]["TripCapacity"];
            trip_type: "foot" | "bicycle" | "car" | "combined" | null;
            day_count: number;
            confirmed_participants: number;
            applications_open: boolean;
            lifecycle: "planned" | "in_progress" | "completed" | "cancelled";
            description: string;
            start: components["schemas"]["LonLat"];
            days: components["schemas"]["PublicDay"][];
            pois: components["schemas"]["PublicPoi"][];
        };
        PublicDay: {
            legs: {
                name: string | null;
                start_name: string | null;
                end_name: string | null;
                distance_m: number;
                transport_mode: components["schemas"]["GeoTransportMode"];
            }[];
            local_date: components["schemas"]["TripCalendarDate"];
            description: components["schemas"]["TripText"];
            position: number;
            lines: components["schemas"]["LineString"][];
        };
        CatalogFilterOption: {
            value: string;
            label: string;
        };
        CatalogFilterOptions: {
            regions: components["schemas"]["CatalogFilterOption"][];
            difficulties: components["schemas"]["CatalogFilterOption"][];
        };
        PublicTripPage: {
            items: components["schemas"]["PublicTripSummary"][];
            next_cursor: string | null;
        };
        PublicPoi: {
            poi_id: components["schemas"]["Uuid"];
            name: string;
            position: components["schemas"]["LonLat"];
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
        EquipmentWriteConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "IDEMPOTENCY_KEY_REUSED" | "EQUIPMENT_DETAILS_CONFLICT";
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
        OwnTripFavorite: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "TRIP_FAVORITE_OWN";
                };
            };
        };
        TravelApplicationUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 409;
                    code?: "TRIP_APPLICATION_UNAVAILABLE";
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
        InvalidPublicationManifest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    status?: 422;
                    code?: "INVALID_PUBLICATION_MANIFEST";
                };
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
    listEquipmentLibrary: {
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
                    "application/json": components["schemas"]["EquipmentLibrary"];
                };
            };
            401: components["responses"]["TravelSessionRequired"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    createPersonalEquipment: {
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
                "application/json": components["schemas"]["CreatePersonalEquipmentRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EquipmentLibraryItem"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            403: components["responses"]["TravelCsrfRejected"];
            404: components["responses"]["TravelDraftNotFound"];
            409: components["responses"]["EquipmentWriteConflict"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
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
    listAccountTrips: {
        parameters: {
            query?: {
                collection?: "all" | "created" | "participation" | "pending" | "joined" | "favorites";
                status?: "all" | "draft" | "published" | "starting_soon" | "in_progress" | "completed" | "cancelled" | "archived";
                query?: string;
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
                    "application/json": components["schemas"]["AccountTripPage"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getTripFavorite: {
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
                    "application/json": components["schemas"]["TripFavoriteState"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    setTripFavorite: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
            };
            path: {
                tripId: components["parameters"]["TripId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    saved: boolean;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TripFavoriteState"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            403: components["responses"]["TravelCsrfRejected"];
            404: components["responses"]["TravelDraftNotFound"];
            409: components["responses"]["OwnTripFavorite"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getTripRoster: {
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
                    "application/json": components["schemas"]["TripRoster"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            404: components["responses"]["TravelDraftNotFound"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    updateTripRoster: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
            };
            path: {
                tripId: components["parameters"]["TripId"];
                entryId: components["schemas"]["Uuid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    action: "accept" | "decline" | "remove";
                };
            };
        };
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            403: components["responses"]["TravelCsrfRejected"];
            404: components["responses"]["TravelDraftNotFound"];
            409: components["responses"]["TravelApplicationUnavailable"];
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
    updateTripDraft: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                tripId: components["parameters"]["TripId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateTripDraftRequest"];
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
            422: components["responses"]["TravelInvalidDates"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    publishTrip: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                tripId: components["parameters"]["TripId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublishCommand"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicationTerminal"];
                };
            };
            202: {
                headers: {
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicationPending"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            403: components["responses"]["TravelCsrfRejected"];
            404: components["responses"]["TravelDraftNotFound"];
            409: components["responses"]["TravelWriteConflict"];
            422: components["responses"]["InvalidPublicationManifest"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getPublicationOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tripId: components["parameters"]["TripId"];
                operationId: components["schemas"]["Uuid"];
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
                    "application/json": components["schemas"]["PublicationOperation"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            404: components["responses"]["TravelDraftNotFound"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    unpublishTrip: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                tripId: components["parameters"]["TripId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UnpublishCommand"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnpublishResult"];
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
    listPublicTrips: {
        parameters: {
            query?: {
                near?: number[];
                radius_km?: number;
                q?: string;
                trip_type?: ("foot" | "bicycle" | "car" | "combined")[];
                start_date?: string;
                end_date?: string;
                difficulty?: string;
                region?: string;
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
                    "application/json": components["schemas"]["PublicTripPage"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getCatalogFilterOptions: {
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
                    "application/json": components["schemas"]["CatalogFilterOptions"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getCatalogParticipation: {
        parameters: {
            query: {
                trip_ids: components["schemas"]["Uuid"][];
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
                    "application/json": {
                        saved_trip_ids: components["schemas"]["Uuid"][];
                        owned_trip_ids: components["schemas"]["Uuid"][];
                        joined_trip_ids: components["schemas"]["Uuid"][];
                        viewer_id: components["schemas"]["Uuid"] | null;
                        trip_ids: components["schemas"]["Uuid"][];
                    };
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    requestTripParticipation: {
        parameters: {
            query?: never;
            header: {
                Origin: components["parameters"]["IdentityOrigin"];
            };
            path: {
                tripId: components["parameters"]["TripId"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    admission_mode?: components["schemas"]["TripAdmissionMode"];
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        status: "pending" | "joined";
                    };
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            401: components["responses"]["TravelSessionRequired"];
            403: components["responses"]["TravelCsrfRejected"];
            404: components["responses"]["TravelDraftNotFound"];
            409: components["responses"]["TravelApplicationUnavailable"];
            503: components["responses"]["TravelUnavailable"];
        };
    };
    getPublicTrip: {
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
                    "application/json": components["schemas"]["PublicTrip"];
                };
            };
            400: components["responses"]["TravelInvalidRequest"];
            404: components["responses"]["TravelDraftNotFound"];
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
