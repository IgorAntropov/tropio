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
}
