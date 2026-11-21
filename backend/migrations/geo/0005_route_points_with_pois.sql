CREATE INDEX route_points_poi_dependency_idx ON route_points (route_id, route_version, poi_id) WHERE poi_id IS NOT NULL;
