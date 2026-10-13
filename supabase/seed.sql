-- Local QA fixtures only. Never use this seed for the production project.
insert into app_private.teams(id,name,normalized_name) values
('10000000-0000-4000-8000-000000000001','테스트 1팀','테스트 1팀'),
('10000000-0000-4000-8000-000000000002','테스트 2팀','테스트 2팀');
insert into app_private.categories(id,name,normalized_name,kind) values
('20000000-0000-4000-8000-000000000001','맛집','맛집','PLACE'),
('20000000-0000-4000-8000-000000000002','카페','카페','PLACE'),
('20000000-0000-4000-8000-000000000003','산책','산책','COURSE');
