import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommandResult, Favorite, Participant, Point, Target, TargetDetail, TargetInput } from "../../shared/contracts";
import { createFavoriteSchema, editFavoriteSchema, graphemeLength } from "../../shared/validation";
import { ApiError, edge, rpc } from "../lib/api";
import { prepareIdentity, resetIdentity } from "../lib/identity";
import { useCatalog } from "../lib/state";
import { ConfirmDialog, ErrorNotice, Loading } from "../components/ui";
import { showToast, useErrorToast } from "../components/Toast";
import { Icon } from "../components/Icon";
import { MapPanel, MapScene, MapToolbar } from "../components/MapScene";
import { existingPhotos, type DraftPhoto } from "../features/media/draft";
const CourseEditor = lazy(() => import("../features/courses/Editor").then((m) => ({ default: m.CourseEditor })));
const PhotoPicker = lazy(() => import("../features/media/PhotoPicker").then((m) => ({ default: m.PhotoPicker })));
type Place = { placeId: string; name: string; address: string; lng: number; lat: number; selectionToken: string };
export default function RegisterPage({ courseOnly = false }: { courseOnly?: boolean }) {
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate(),
    query = useQueryClient();
  const state = location.state as { favorite?: Favorite; target?: Target; searchPlace?: Place } | null;
  const catalog = useCatalog();
  const [token, setToken] = useState(""),
    [identityError, setIdentityError] = useState<unknown>();
  const [favorite, setFavorite] = useState<Favorite>();
  const requestedFavoriteId = params.get("favorite") ?? state?.favorite?.id;
  const [verifiedOwner, setVerifiedOwner] = useState(false);
  const [preparedTarget, setTarget] = useState<TargetInput | null>(
    params.get("target") ? { type: "existing", targetId: params.get("target")! } : state?.favorite ? { type: "existing", targetId: state.favorite.targetId } : null,
  );
  const [targetName, setTargetName] = useState(state?.target?.name ?? state?.favorite?.target?.name ?? "선택한 최애");
  const course = courseOnly;
  const [courseName, setCourseName] = useState(""),
    [points, setPoints] = useState<Point[]>([]);
  const selectedPlace = state?.searchPlace ?? null;
  const target: TargetInput | null = selectedPlace ? { type: "place", selectionToken: selectedPlace.selectionToken } : preparedTarget;
  const returnTargetId = params.get("from") === "detail" ? (params.get("target") ?? favorite?.targetId) : null;
  const detailReturnPath = returnTargetId ? `/targets/${returnTargetId}${params.get("return") ? `?${params.get("return")}` : ""}` : null;
  const close = () => {
    if (selectedPlace) navigate(-1);
    else navigate(detailReturnPath ?? (favorite || params.get("favorite") ? "/me/favorites" : "/"), { replace: true });
  };
  const searchResultsRef = useRef<HTMLDivElement>(null),
    searchScroll = useRef(0);
  useEffect(() => {
    if (selectedPlace) return;
    const frame = requestAnimationFrame(() => {
      const content = searchResultsRef.current?.closest(".panel-content");
      if (content) content.scrollTop = searchScroll.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedPlace]);
  const [mapCenter, setMapCenter] = useState<Point>([127.0632, 37.5088]);
  const [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [searchPage, setSearchPage] = useState(1);
  const [categoryId, setCategoryId] = useState(state?.favorite?.categoryId ?? ""),
    [message, setMessage] = useState(state?.favorite?.message ?? "");
  const [photos, setPhotos] = useState<DraftPhoto[]>(() => existingPhotos(state?.favorite?.photos ?? []));
  const [dirty, setDirty] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState<unknown>();
  const [deleteOpen, setDeleteOpen] = useState(false),
    [newIdentityOpen, setNewIdentityOpen] = useState(false);
  const currentPhotos = useRef(photos);
  currentPhotos.current = photos;
  useEffect(
    () => () => {
      for (const photo of currentPhotos.current) if (photo.preview) URL.revokeObjectURL(photo.preview);
    },
    [],
  );
  const submitted = useRef<{ key: string; body: unknown } | null>(null);
  const allowedNavigation = useRef(false);
  const blocker = useBlocker(() => dirty && !allowedNavigation.current);
  const existingTarget = useQuery({
    queryKey: ["register-target", target?.type === "existing" ? target.targetId : null],
    enabled: target?.type === "existing",
    queryFn: ({ signal }) =>
      rpc<{ target: Target }>("read_target", { p_target_id: target?.type === "existing" ? target.targetId : null, p_team_id: null, p_category_id: null, p_cursor: null, p_expected_revision: null }, signal),
  });
  useEffect(() => {
    if (target?.type === "existing" && existingTarget.data?.target.id === target.targetId) setTargetName(existingTarget.data.target.name);
  }, [existingTarget.data, target]);
  const me = useQuery({ queryKey: ["me", token], enabled: !!token, queryFn: () => edge<Participant | null>("/me", { token }) });
  const identity = () => {
    setIdentityError(undefined);
    void prepareIdentity().then(setToken).catch(setIdentityError);
  };
  useEffect(identity, []);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const places = useQuery({
    queryKey: ["places", debouncedSearch, searchPage, token],
    enabled: !!token && !!debouncedSearch && !target && !course,
    queryFn: ({ signal }) => edge<{ places: Place[]; isEnd: boolean }>(`/places/search?q=${encodeURIComponent(debouncedSearch)}&page=${searchPage}`, { token, signal }),
  });
  useEffect(() => {
    if (!token || !requestedFavoriteId) return;
    setVerifiedOwner(false);
    setFavorite(undefined);
    let stopped = false;
    void (async () => {
      let cursor: string | null = null;
      do {
        const response: { favorites: Favorite[]; nextCursor: string | null } = await edge(`/me/favorites${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { token });
        const found = response.favorites.find((f) => f.id === requestedFavoriteId);
        if (found) {
          if (!stopped) {
            setFavorite(found);
            setVerifiedOwner(true);
            setTarget({ type: "existing", targetId: found.targetId });
            setTargetName(found.target?.name ?? "내 최애");
            setCategoryId(found.categoryId);
            setMessage(found.message);
            setPhotos(existingPhotos(found.photos));
          }
          return;
        }
        cursor = response.nextCursor;
      } while (cursor && !stopped);
      if (!stopped) setError(new Error("수정할 내 등록을 찾지 못했어요. 내 최애에서 다시 선택해 주세요."));
    })().catch((e) => {
      if (!stopped) setError(e);
    });
    return () => {
      stopped = true;
    };
  }, [token, requestedFavoriteId]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const change = () => {
    setDirty(true);
    if (!uncertain) submitted.current = null;
  };
  const kind = target?.type === "place" ? "PLACE" : target?.type === "course" ? "COURSE" : (existingTarget.data?.target.kind ?? favorite?.target?.kind ?? state?.target?.kind ?? (course ? "COURSE" : "PLACE"));
  useErrorToast(error);
  useErrorToast(identityError);
  useErrorToast(me.error);
  useErrorToast(existingTarget.error);
  useErrorToast(places.error);
  const categories = catalog.data?.selectableCategories.filter((c) => c.kind === kind) ?? [];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(undefined);
    try {
      if (!me.isSuccess || !me.data || (requestedFavoriteId && !verifiedOwner)) throw new Error("참여 정보와 본인 등록을 먼저 확인해 주세요.");
      if (!target) throw new Error("등록할 실제 장소나 코스를 먼저 선택해 주세요.");
      if (photos.some((p) => p.status !== "ready" || !p.assetId)) throw new Error("선택한 사진이 모두 준비된 뒤 제출해 주세요. 실패한 사진은 다시 시도하거나 제거할 수 있어요.");
      const key = submitted.current?.key ?? crypto.randomUUID();
      const photoSlots = photos.map((p, i) => ({ assetId: p.assetId!, slot: (i + 1) as 1 | 2 | 3 }));
      const raw = favorite ? { requestKey: key, expectedVersion: favorite.version, categoryId, message, photos: photoSlots } : { requestKey: key, target, categoryId, message, photos: photoSlots };
      const valid = (favorite ? editFavoriteSchema : createFavoriteSchema).safeParse(raw);
      if (!valid.success) throw new Error(valid.error.issues.map((i) => i.message).join(" · "));
      const body = submitted.current?.body ?? valid.data;
      submitted.current = { key, body };
      setSubmitting(true);
      setUncertain(true);
      const result = await edge<CommandResult>(favorite ? `/favorites/${favorite.id}` : "/favorites", { method: favorite ? "PATCH" : "POST", token, body });
      const targetId = result.targetId ?? favorite?.targetId ?? (target.type === "existing" ? target.targetId : null);
      if (!targetId) throw new Error("등록 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.");
      const [firstDetail, profile] = await Promise.all([
        rpc<TargetDetail>("read_target", { p_target_id: targetId, p_team_id: null, p_category_id: null, p_cursor: null, p_expected_revision: null }),
        edge<Participant | null>("/me", { token }),
      ]);
      let detail = firstDetail;
      let confirmed = !!profile && detail.favorites.some((f) => f.id === result.resourceId && f.participantId === profile.id);
      while (!confirmed && detail.nextCursor) {
        detail = await rpc<TargetDetail>("read_target", { p_target_id: targetId, p_team_id: null, p_category_id: null, p_cursor: detail.nextCursor, p_expected_revision: firstDetail.revision });
        confirmed = !!profile && detail.favorites.some((f) => f.id === result.resourceId && f.participantId === profile.id);
      }
      if (!profile || !confirmed) throw new Error("저장은 응답했지만 최신 상세에서 아직 확인되지 않았어요. 같은 요청으로 다시 확인해 주세요.");
      query.setQueryData(["me", token], profile);
      await query.invalidateQueries();
      allowedNavigation.current = true;
      setDirty(false);
      navigate(`/targets/${targetId}${params.get("return") ? `?${params.get("return")}` : ""}`, { replace: true, state: { completed: true, returnQuery: params.get("return") ?? "" } });
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && !["INTERNAL_ERROR", "NETWORK_ERROR", "DEPENDENCY_UNAVAILABLE"].includes(e.code)) {
        setUncertain(false);
        if (e.code === "VERSION_CONFLICT" && favorite) {
          const latest = await edge<{ favorites: Favorite[] }>("/me/favorites", { token }).catch(() => null);
          const found = latest?.favorites.find((f) => f.id === favorite.id);
          if (found) {
            setFavorite(found);
            submitted.current = null;
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  };
  const deleteFavorite = async () => {
    if (!favorite) return;
    setSubmitting(true);
    try {
      const key = submitted.current?.key ?? crypto.randomUUID();
      submitted.current = { key, body: { requestKey: key, expectedVersion: favorite.version } };
      await edge(`/favorites/${favorite.id}`, { method: "DELETE", token, body: submitted.current.body });
      await query.invalidateQueries();
      query.removeQueries({ queryKey: ["target-pages", favorite.targetId, null, null], exact: true });
      query.setQueryData(["mine-target", token, favorite.targetId], null);
      allowedNavigation.current = true;
      setDirty(false);
      navigate(detailReturnPath ?? "/me/favorites", { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
      setDeleteOpen(false);
    }
  };
  const savedTarget = existingTarget.data?.target ?? state?.target ?? favorite?.target;
  const mapPins = target
    ? kind === "PLACE"
      ? selectedPlace
        ? [{ targetId: selectedPlace.placeId, kind: "PLACE" as const, lng: selectedPlace.lng, lat: selectedPlace.lat, count: 0, name: selectedPlace.name }]
        : savedTarget
          ? [{ targetId: savedTarget.id, kind: savedTarget.kind, lng: savedTarget.lng, lat: savedTarget.lat, count: 0, name: savedTarget.name }]
          : []
      : []
    : (places.data?.places ?? []).map((place) => ({ targetId: place.placeId, kind: "PLACE" as const, lng: place.lng, lat: place.lat, count: 0, name: place.name }));
  const selectedPoint: Point | undefined = target
    ? selectedPlace
      ? [selectedPlace.lng, selectedPlace.lat]
      : savedTarget
        ? [savedTarget.lng, savedTarget.lat]
        : target.type === "course"
          ? target.points[0]
          : undefined
    : undefined;
  const choosePlace = (id: string) => {
    const place = places.data?.places.find((p) => p.placeId === id);
    if (!place || target) return;
    searchScroll.current = searchResultsRef.current?.closest(".panel-content")?.scrollTop ?? 0;
    setTargetName(place.name);
    setError(undefined);
    submitted.current = null;
    navigate(`${location.pathname}${location.search}`, { state: { ...state, searchPlace: place } });
  };
  const discardDraft = () => {
    for (const photo of photos) if (photo.preview) URL.revokeObjectURL(photo.preview);
    setPhotos([]);
    setCategoryId("");
    setMessage("");
    setDirty(false);
    setError(undefined);
    setUncertain(false);
    submitted.current = null;
  };
  if (requestedFavoriteId && (!verifiedOwner || !me.isSuccess || !me.data || favorite?.participantId !== me.data.id))
    return (
      <section className="page">
        {error || me.error ? <ErrorNotice error={error ?? me.error} /> : <Loading text="본인 등록을 확인하고 있어요…" />}
        <button onClick={close}>돌아가기</button>
      </section>
    );
  return (
    <MapScene
      className="register-scene"
      pins={mapPins}
      selectedId={selectedPlace?.placeId ?? savedTarget?.id}
      focusPoint={selectedPoint}
      focusLevel={selectedPlace ? 3 : undefined}
      points={target?.type === "course" ? target.points : kind === "COURSE" && savedTarget ? (savedTarget.points ?? []) : points}
      editing={course && !target}
      onCenter={course && !target ? setMapCenter : undefined}
      fitPins={!target && !course}
      onSelect={choosePlace}
    >
      <MapToolbar hideMobileMenu />
      {!course && !favorite && !target ? (
        <div className="floating-search">
          <Icon name="search" />
          <label>
            <span className="visually-hidden">장소 검색</span>
            <input
              value={search}
              disabled={!token}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchPage(1);
              }}
              placeholder="어떤 장소를 좋아하세요?"
            />
          </label>
        </div>
      ) : null}
      <MapPanel
        title={favorite ? "내 최애 수정" : course && !target ? "나만의 산책코스" : target ? "이곳을 최애로 등록" : "장소 검색 결과"}
        eyebrow={favorite ? "EDIT MY FAVORITE" : "SHARE YOUR FAVORITE"}
        initialSize={target ? "expanded" : "middle"}
        onClose={close}
        footer={
          target && token ? (
            <div className="registration-footer">
              <button form="favorite-form" type="submit" className="primary" disabled={submitting || me.isPending || !!me.error}>
                {submitting ? "결과 확인 중…" : uncertain ? "같은 요청으로 결과 확인" : favorite ? "변경 저장하기" : "최애 등록하기"}
              </button>
              {favorite ? (
                <button
                  type="button"
                  className="danger"
                  disabled={submitting || uncertain}
                  onClick={() => {
                    submitted.current = null;
                    setDeleteOpen(true);
                  }}
                >
                  내 등록 삭제
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {identityError ? (
          <>
            <ErrorNotice error={identityError} retry={identity} />
            {identityError instanceof ApiError && identityError.code === "IDENTITY_EXPIRED" ? <button onClick={() => setNewIdentityOpen(true)}>새 참여자로 시작하기</button> : null}
          </>
        ) : null}
        {!token && !identityError ? <Loading text="참여를 준비하고 있어요…" /> : null}
        {error ? <ErrorNotice error={error} /> : null}
        {target?.type === "existing" && existingTarget.error && !(error instanceof ApiError && error.code === "TARGET_GONE") ? <ErrorNotice error={existingTarget.error} /> : null}
        {me.error ? <ErrorNotice error={me.error} retry={() => void me.refetch()} /> : null}
        {uncertain && !submitting ? <p className="notice">이전 제출의 결과가 아직 확정되지 않았어요. 같은 내용으로 결과를 확인해 주세요.</p> : null}
        {!target && token ? (
          <div ref={searchResultsRef} className="target-select">
            {!course ? (
              <>
                <p className="muted">삼성역 기준 가까운 순</p>
                {places.isFetching ? <Loading text="장소 검색 중…" /> : null}
                {places.error ? <ErrorNotice error={places.error} /> : null}
                {places.data ? (
                  places.data.places.length ? (
                    <>
                      <ul className="search-results">
                        {places.data.places.map((place) => (
                          <li key={place.placeId}>
                            <button onClick={() => choosePlace(place.placeId)}>
                              <strong>{place.name}</strong>
                              <span>{place.address}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {!places.data.isEnd ? <button onClick={() => setSearchPage((p) => p + 1)}>검색 결과 더 보기</button> : null}
                    </>
                  ) : (
                    <p>검색 결과가 없어요. 다른 검색어로 찾아 주세요.</p>
                  )
                ) : null}
              </>
            ) : (
              <Suspense fallback={<Loading />}>
                <CourseEditor
                  mapCenter={mapCenter}
                  name={courseName}
                  points={points}
                  onChange={(name, next) => {
                    setCourseName(name);
                    setPoints(next);
                    change();
                  }}
                  onComplete={() => {
                    setTarget({ type: "course", name: courseName.trim(), points });
                    setTargetName(courseName.trim());
                  }}
                />
              </Suspense>
            )}
          </div>
        ) : null}
        {target && token ? (
          <form id="favorite-form" onSubmit={submit} onInvalidCapture={() => showToast("카테고리를 선택해 주세요.")}>
            <div className="selected-target">
              <span className="badge">선택한 {kind === "COURSE" ? "코스" : "장소"}</span>
              <h2>{targetName}</h2>
              <p className="muted">{selectedPlace?.address ?? existingTarget.data?.target.address}</p>
            </div>
            {me.isSuccess && me.data ? (
              <p className="registration-author">
                <strong>{me.data.nickname}</strong> · <strong>{me.data.teamName}</strong>으로 등록해요.
              </p>
            ) : null}
            <fieldset disabled={submitting || uncertain}>
              <label>
                카테고리
                <select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    change();
                  }}
                  required
                >
                  <option value="">카테고리를 선택해 주세요</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {favorite && !categories.some((c) => c.id === categoryId) ? <option value={categoryId}>{favorite.categoryName} (신규 선택 중단)</option> : null}
                </select>
              </label>
              <label>
                최애를 소개하는 한마디 <span className="optional-field-note">선택</span>
                <textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    change();
                  }}
                  rows={4}
                  placeholder="이 장소나 코스를 좋아하는 이유를 알려 주세요"
                />
                <small>{graphemeLength(message.trim())}/100자</small>
              </label>
              <Suspense fallback={<Loading text="사진 준비 화면을 여는 중…" />}>
                <PhotoPicker
                  photos={photos}
                  onChange={(next) => {
                    setPhotos(next);
                    change();
                  }}
                  token={token}
                />
              </Suspense>
            </fieldset>
          </form>
        ) : null}
      </MapPanel>
      <ConfirmDialog
        title="작성 내용을 버릴까요?"
        open={blocker.state === "blocked"}
        onClose={() => blocker.state === "blocked" && blocker.reset()}
        onConfirm={() => {
          if (blocker.state === "blocked") {
            if (selectedPlace) discardDraft();
            blocker.proceed();
          }
        }}
        action="초안 버리기"
      >
        <p>문구·사진 초안은 저장되지 않아요. 이미 저장한 참여 정보는 유지돼요.</p>
      </ConfirmDialog>
      <ConfirmDialog title="내 최애 등록을 삭제할까요?" open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={() => void deleteFavorite()} busy={submitting}>
        <p>다른 동료의 등록은 유지돼요. 나중에 새로 등록할 수 있어요.</p>
      </ConfirmDialog>
      <ConfirmDialog
        title="새 참여자로 시작할까요?"
        open={newIdentityOpen}
        onClose={() => setNewIdentityOpen(false)}
        onConfirm={() => {
          resetIdentity();
          setNewIdentityOpen(false);
          identity();
        }}
        action="새 참여 시작"
      >
        <p>이전 등록의 수정 권한은 자동으로 복구되지 않아요. 과거 등록 정정은 운영자에게 요청해 주세요.</p>
      </ConfirmDialog>
    </MapScene>
  );
}
