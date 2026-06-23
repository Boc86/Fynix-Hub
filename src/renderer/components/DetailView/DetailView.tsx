import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMediaStore } from '../../store/mediaStore';
import type { Episode, TvDetails, MovieDetails, MediaItem, CastMember, CrewMember, Video } from '../../types';
import type { ContextTarget } from '../ContextMenu/ContextMenu';
import styles from './DetailView.module.css';

interface DetailViewProps {
  onBack: () => void;
  onPlay: (resumePosition?: number) => void;
  onPlayTrailer: (youtubeUrl: string) => void;
  onContextMenu?: (target: ContextTarget) => void;
}

const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

function formatRuntime(minutes?: number): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getCrewByJob(crew: CrewMember[], jobs: string[]): CrewMember[] {
  return crew.filter((c) => jobs.includes(c.job));
}

export default function DetailView({ onBack, onPlay, onPlayTrailer, onContextMenu }: DetailViewProps) {
  const {
    selectedMedia,
    selectedSeason,
    selectedEpisode,
    seasonEpisodes,
    setSelectedMedia,
    setSelectedSeason,
    setSelectedEpisode,
    setSeasonEpisodes,
    setResumeProgress,
    resumeProgress,
    traktWatched,
  } = useMediaStore();

  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [clearlogo, setClearlogo] = useState<string | null>(null);
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  const [isTv, setIsTv] = useState(false);

  // Keyboard navigation state
  const [focusedSection, setFocusedSection] = useState(0);
  const [focusedItem, setFocusedItem] = useState(-1);
  const detailRef = useRef<HTMLDivElement>(null);
  const seasonScrollRef = useRef<HTMLDivElement>(null);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedItem < 0) return;
    const el = detailRef.current?.querySelector(`[data-section="${focusedSection}"][data-item="${focusedItem}"]`);
    if (el) {
      const section = sectionConfig[focusedSection];
      if (section?.id === 'season') {
        const container = seasonScrollRef.current;
        if (container) {
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const scrollLeft = container.scrollLeft + elRect.left - containerRect.left - containerRect.width / 2 + elRect.width / 2;
          container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
          return;
        }
      }
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedSection, focusedItem]);

  const sections = [
    { id: 'actions', label: 'Actions', itemCount: 0 },
    { id: 'episodes', label: 'Episodes', itemCount: 0 },
    { id: 'cast', label: 'Cast', itemCount: 0 },
    { id: 'trailers', label: 'Trailers', itemCount: 0 },
    { id: 'similar', label: 'Similar', itemCount: 0 },
  ];

  useEffect(() => {
    setIsTv(!!selectedMedia && 'seasons' in selectedMedia);
  }, [selectedMedia]);

  useEffect(() => {
    if (!isTv || !selectedMedia) return;
    const tv = selectedMedia as TvDetails;
    const seasonNum = selectedSeason;

    async function loadEpisodes() {
      setLoadingEpisodes(true);
      try {
        const data = await window.api.tmdb.getSeason(tv.id, seasonNum);
        if (data?.episodes) {
          setSeasonEpisodes(data.episodes);
        }
      } catch {
        // ignore
      } finally {
        setLoadingEpisodes(false);
      }
    }
    loadEpisodes();
  }, [selectedMedia?.id, selectedSeason, isTv, setSeasonEpisodes]);

  useEffect(() => {
    if (!selectedMedia) return;
    const media = selectedMedia;
    async function checkResume() {
      const progress = await window.api.watch.getProgress(media.id, media.mediaType || 'movie');
      if (progress && progress > 0.01 && progress < 0.95 && resumeProgress === null) {
        setResumeProgress(progress);
      }
    }
    checkResume();
  }, [selectedMedia?.id, resumeProgress, setResumeProgress]);

  useEffect(() => {
    if (!selectedMedia) return;
    window.api.fanart.getImages(selectedMedia.id, selectedMedia.mediaType).then((res) => {
      setClearlogo(res.clearlogo || res.clearart || null);
    }).catch(() => {});
  }, [selectedMedia?.id, selectedMedia?.mediaType]);

  useEffect(() => {
    if (!selectedMedia) return;
    const media = selectedMedia;
    async function loadSimilar() {
      try {
        const data = await window.api.tmdb.getSimilar(media.mediaType, media.id);
        setSimilar(data?.results?.slice(0, 12) || []);
      } catch {
        setSimilar([]);
      }
    }
    loadSimilar();
  }, [selectedMedia?.id, selectedMedia?.mediaType]);

  // Auto-focus on mount
  useEffect(() => {
    detailRef.current?.focus();
  }, []);

  const backdropUrl = selectedMedia?.backdropPath
  ? `${TMDB_IMAGE}/original${selectedMedia.backdropPath}`
  : null;

  const posterUrl = selectedMedia?.posterPath
  ? `${TMDB_IMAGE}/w342${selectedMedia.posterPath}`
  : null;

  const seasons = isTv ? (selectedMedia as TvDetails)?.seasons?.filter((s) => s.seasonNumber > 0) || [] : [];

  const cast: CastMember[] = selectedMedia?.credits?.cast?.slice(0, 12) || [];
  const crew: CrewMember[] = selectedMedia?.credits?.crew || [];
  const directors = getCrewByJob(crew, ['Director']);
  const writers = getCrewByJob(crew, ['Writer', 'Screenplay', 'Story']);
  const creators = isTv ? (selectedMedia as TvDetails).createdBy || [] : [];

  const videos: Video[] = selectedMedia?.videos?.results || [];
  // Trailers hidden until a reliable YouTube playback solution is available
  const trailers: typeof videos = [];

  const logos = isTv
  ? (selectedMedia as TvDetails).networks?.filter((n) => n.logoPath) || []
  : (selectedMedia as MovieDetails).productionCompanies?.filter((c) => c.logoPath) || [];

  // Update section counts for keyboard nav
  useEffect(() => {
    const actionCount = (isTv ? 1 : (resumeProgress !== null ? 2 : 1)) + (trailers.length > 0 ? 1 : 0);
    const newSections = isTv ? [
      { id: 'actions', label: 'Actions', itemCount: actionCount },
      { id: 'season', label: 'Season', itemCount: seasons.length },
      { id: 'episodes', label: 'Episodes', itemCount: seasonEpisodes.length },
      { id: 'cast', label: 'Cast', itemCount: cast.length },
      { id: 'similar', label: 'Similar', itemCount: similar.length },
    ] : [
      { id: 'actions', label: 'Actions', itemCount: actionCount },
      { id: 'cast', label: 'Cast', itemCount: cast.length },
      { id: 'similar', label: 'Similar', itemCount: similar.length },
    ];
    setSections(newSections);
  }, [isTv, resumeProgress, trailers.length, seasons.length, seasonEpisodes.length, cast.length, similar.length]);

  const [sectionConfig, setSections] = useState(sections);

  const handleEpisodeClick = (ep: Episode) => {
    setSelectedEpisode(ep.episodeNumber);
    setResumeProgress(null);
    onPlay();
  };

  const handleSelectSimilar = async (item: MediaItem) => {
    try {
      const detail = await window.api.tmdb.getDetails(item.mediaType, item.id);
      setSelectedMedia(detail);
    } catch {
      setSelectedMedia(item as any);
    }
    setSelectedSeason(1);
    setSelectedEpisode(null);
    setResumeProgress(null);
    setSimilar([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
    if (isTyping) return;

    const totalSections = sectionConfig.length;
    const currentSection = sectionConfig[focusedSection];

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        if (currentSection.id === 'episodes') return;
        if (focusedItem < currentSection.itemCount - 1) {
          setFocusedItem((c) => c + 1);
        } else if (focusedSection < totalSections - 1) {
          let nextSection = focusedSection + 1;
          while (nextSection < totalSections && sectionConfig[nextSection].itemCount === 0) {
            nextSection++;
          }
          if (nextSection < totalSections) {
            setFocusedSection(nextSection);
            setFocusedItem(0);
          }
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (currentSection.id === 'episodes') return;
        if (focusedItem > 0) {
          setFocusedItem((c) => c - 1);
        } else if (focusedSection > 0) {
          let prevSection = focusedSection - 1;
          while (prevSection >= 0 && sectionConfig[prevSection].itemCount === 0) {
            prevSection--;
          }
          if (prevSection >= 0) {
            setFocusedSection(prevSection);
            setFocusedItem(sectionConfig[prevSection].itemCount - 1);
          }
        }
        break;
      case 'ArrowDown':
        e.preventDefault();

      if (currentSection.id === 'episodes' && focusedItem < currentSection.itemCount - 1) {
        setFocusedItem((c) => c + 1);
      } else {
        let nextSection = focusedSection + 1;
        while (nextSection < totalSections && sectionConfig[nextSection].itemCount === 0) {
          nextSection++;
        }
        if (nextSection < totalSections) {
          setFocusedSection(nextSection);
          setFocusedItem(0);
        }
      }
      break;
      case 'ArrowUp':
        e.preventDefault();

      if (currentSection.id === 'episodes' && focusedItem > 0) {
        setFocusedItem((c) => c - 1);
      } else if (focusedSection > 0) {
        let prevSection = focusedSection - 1;
        while (prevSection >= 0 && sectionConfig[prevSection].itemCount === 0) {
          prevSection--;
        }
        if (prevSection >= 0) {
          setFocusedSection(prevSection);
          setFocusedItem(sectionConfig[prevSection].id === 'episodes'
          ? sectionConfig[prevSection].itemCount - 1
          : 0);
        }
      }
      break;
      case 'Enter':
        e.preventDefault();
        // Activate focused element
        const section = sectionConfig[focusedSection];
        if (section.id === 'actions') {
          const actionBtns = document.querySelectorAll(`.${styles.actions} button:not(:disabled)`);
          if (actionBtns[focusedItem]) (actionBtns[focusedItem] as HTMLElement).click();
        } else if (section.id === 'episodes') {
          const ep = seasonEpisodes[focusedItem];
          if (ep) handleEpisodeClick(ep);
        } else if (section.id === 'season') {
          const s = seasons[focusedItem];
          if (s) setSelectedSeason(s.seasonNumber);
        } else if (section.id === 'similar') {
          const item = similar[focusedItem];
          if (item) handleSelectSimilar(item);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onBack();
        break;
      case 'c': {
        e.preventDefault();
        if (!onContextMenu || !selectedMedia) break;
        const cSection = sectionConfig[focusedSection];
        if (cSection.id === 'episodes') {
          const ep = seasonEpisodes[focusedItem];
          if (ep) {
            onContextMenu({
              type: 'episode',
              tmdbId: selectedMedia.id,
              title: selectedMedia.title,
              season: ep.seasonNumber,
              episode: ep.episodeNumber,
            });
          }
        } else {
          onContextMenu({
            type: isTv ? 'tv' : 'movie',
            tmdbId: selectedMedia.id,
            title: selectedMedia.title,
          });
        }
        break;
      }
    }
  }, [focusedSection, focusedItem, sectionConfig, isTv, seasons, seasonEpisodes, trailers, similar, selectedMedia, onPlay, onBack, onContextMenu]);

  if (!selectedMedia) {
    return (
      <div className={styles.empty}>
      <p>Select media to view details</p>
      </div>
    );
  }

  const handleEpisodeKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEpisodeClick(seasonEpisodes[index]);
    }
  }, [seasonEpisodes]);

  const handleSimilarKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectSimilar(similar[index]);
    }
  }, [similar]);

  const actionsIndex = sectionConfig.findIndex((s) => s.id === 'actions');
  const seasonIndex = sectionConfig.findIndex((s) => s.id === 'season');
  const episodesIndex = sectionConfig.findIndex((s) => s.id === 'episodes');
  const castIndex = sectionConfig.findIndex((s) => s.id === 'cast');
  const similarIndex = sectionConfig.findIndex((s) => s.id === 'similar');

  return (
    <div
    ref={detailRef}
    className={styles.detail}
    tabIndex={0}
    onKeyDown={handleKeyDown}
    >
    {backdropUrl && (
      <div
      className={styles.backdrop}
      style={{ backgroundImage: `url(${backdropUrl})` }}
      />
    )}
    <div className={styles.gradient} />
    {logos.length > 0 && (
      <div className={styles.topRightLogos}>
      {logos.map((logo) => (
        <div key={logo.id} className={styles.topLogoItem} title={logo.name}>
        <img
        src={`${TMDB_IMAGE}/w200${logo.logoPath}`}
        alt={logo.name}
        className={styles.topLogoImage}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        </div>
      ))}
      </div>
    )}

    <div className={styles.content}>
    {posterUrl && (
      <img src={posterUrl} alt={selectedMedia.title} className={styles.poster} />
    )}
    <div className={styles.info}>
    {clearlogo ? (
      <img
      src={clearlogo}
      alt=""
      className={styles.clearlogo}
      onError={() => setClearlogo(null)}
      />
    ) : (
      <h1 className={styles.title}>
      {selectedMedia.title}
      {traktWatched.has(selectedMedia.id) && <span className={styles.watchedBadge}>Watched</span>}
      </h1>
    )}

    {'tagline' in selectedMedia && selectedMedia.tagline && (
      <p className={styles.tagline}>{selectedMedia.tagline}</p>
    )}

    <div className={styles.meta}>
    <span className={styles.rating}>{selectedMedia.voteAverage.toFixed(1)}</span>
    <span>{selectedMedia.releaseDate?.slice(0, 4)}</span>
    {'runtime' in selectedMedia && selectedMedia.runtime > 0 && (
      <span>{formatRuntime(selectedMedia.runtime)}</span>
    )}
    {'status' in selectedMedia && selectedMedia.status && (
      <span>{selectedMedia.status}</span>
    )}
    {isTv && (
      <span>{(selectedMedia as TvDetails).numberOfSeasons} Season{(selectedMedia as TvDetails).numberOfSeasons !== 1 ? 's' : ''}</span>
    )}
    {'genres' in selectedMedia && selectedMedia.genres?.map((g) => (
      <span key={g.id} className={styles.genre}>{g.name}</span>
    ))}
    </div>

    <p className={styles.overview}>{selectedMedia.overview}</p>

    <div className={styles.crewHighlights}>
    {directors.length > 0 && (
      <div className={styles.crewGroup}>
      <span className={styles.crewLabel}>Director</span>
      <span className={styles.crewNames}>{directors.map((d) => d.name).join(', ')}</span>
      </div>
    )}
    {writers.length > 0 && (
      <div className={styles.crewGroup}>
      <span className={styles.crewLabel}>Writer</span>
      <span className={styles.crewNames}>{writers.map((w) => w.name).join(', ')}</span>
      </div>
    )}
    {creators.length > 0 && (
      <div className={styles.crewGroup}>
      <span className={styles.crewLabel}>Creator</span>
      <span className={styles.crewNames}>{creators.map((c) => c.name).join(', ')}</span>
      </div>
    )}
    </div>

    <div className={styles.actions}>
    {!isTv && resumeProgress !== null && (
      <button
      className={`${styles.playBtn} ${styles.resumeBtn} ${focusedSection === actionsIndex && focusedItem === 0 ? styles.focused : ''}`}
      onClick={() => onPlay(resumeProgress)}
      tabIndex={focusedSection === actionsIndex && focusedItem === 0 ? 0 : -1}
      data-section={actionsIndex} data-item={0}
      >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
      </svg>
      Resume ({Math.round(resumeProgress * 100)}%)
      </button>
    )}
    {!isTv && (
      <button
      className={`${styles.playBtn} ${focusedSection === actionsIndex && focusedItem === (resumeProgress !== null ? 1 : 0) ? styles.focused : ''}`}
      onClick={() => onPlay()}
      tabIndex={focusedSection === actionsIndex && focusedItem === (resumeProgress !== null ? 1 : 0) ? 0 : -1}
      data-section={actionsIndex} data-item={resumeProgress !== null ? 1 : 0}
      >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
      </svg>
      {resumeProgress !== null ? 'Play from Start' : 'Play'}
      </button>
    )}
    {isTv && (
      <button
      className={`${styles.playBtn} ${focusedSection === actionsIndex && focusedItem === 0 ? styles.focused : ''}`}
      onClick={() => onPlay()}
      tabIndex={focusedSection === actionsIndex && focusedItem === 0 ? 0 : -1}
      data-section={actionsIndex} data-item={0}
      >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
      </svg>
      Play S{String(selectedSeason).padStart(2, '0')}
      {selectedEpisode !== null ? `E${String(selectedEpisode).padStart(2, '0')}` : ''}
      </button>
    )}
    </div>

    {isTv && (
      <div className={styles.tvSection}>
      <div className={styles.seasonSection}>
      <h3 className={styles.seasonHeader}>Seasons</h3>
      <div className={styles.seasonScrollContainer} ref={seasonScrollRef}>
      {seasons.map((s, idx) => (
        <button
        key={s.seasonNumber}
        className={`${styles.seasonButton} ${s.seasonNumber === selectedSeason ? styles.selected : ''} ${focusedSection === seasonIndex && focusedItem === idx ? styles.focused : ''}`}
        onClick={() => setSelectedSeason(s.seasonNumber)}
        data-section={seasonIndex} data-item={idx}
        >
        {s.seasonNumber}
        </button>
      ))}
      </div>
      </div>

      {loadingEpisodes && (
        <div className={styles.episodesLoading}>Loading episodes...</div>
      )}

      {!loadingEpisodes && seasonEpisodes.length > 0 && (
        <div className={styles.episodesList}>
        {seasonEpisodes.map((ep, idx) => {
          const isSelected = selectedEpisode === ep.episodeNumber;
          const isFocused = focusedSection === episodesIndex && focusedItem === idx;
          return (
            <div
            key={ep.id}
            className={`${styles.episode} ${isSelected ? styles.episodeSelected : ''} ${isFocused ? styles.focused : ''}`}
            onClick={() => handleEpisodeClick(ep)}
            onKeyDown={(e) => handleEpisodeKeyDown(e, idx)}
            role="button"
            tabIndex={isFocused ? 0 : -1}
            data-section={episodesIndex} data-item={idx}
            >
            {ep.stillPath ? (
              <img
              src={`${TMDB_IMAGE}/w185${ep.stillPath}`}
              alt=""
              className={styles.episodeThumb}
              loading="lazy"
              />
            ) : (
              <div className={styles.episodeNumber}>{ep.episodeNumber}</div>
            )}
            <div className={styles.episodeInfo}>
            <div className={styles.episodeTitle}>{ep.name}</div>
            <div className={styles.episodeMeta}>
            {ep.voteAverage > 0 && (
              <span className={styles.episodeRating}>{ep.voteAverage.toFixed(1)}</span>
            )}
            <span>{ep.airDate?.slice(0, 4) || ''}</span>
            </div>
            <p className={styles.episodeOverview}>{ep.overview}</p>
            </div>
            </div>
          );
        })}
        </div>
      )}
      </div>
    )}
    </div>
    </div>

    <div className={styles.sections}>
    {cast.length > 0 && (
      <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Cast</h2>
      <div className={styles.castList}>
      {cast.map((person, idx) => {
        const isFocused = focusedSection === castIndex && focusedItem === idx;
        return (
          <div
          key={person.id}
          className={`${styles.castCard} ${isFocused ? styles.focused : ''}`}
          role="button"
          tabIndex={isFocused ? 0 : -1}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }}
          data-section={castIndex} data-item={idx}
          >
          {person.profilePath ? (
            <img
            src={`${TMDB_IMAGE}/w185${person.profilePath}`}
            alt={person.name}
            className={styles.castPhoto}
            />
          ) : (
            <div className={styles.castPlaceholder}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            </div>
          )}
          <div className={styles.castName}>{person.name}</div>
          <div className={styles.castCharacter}>{person.character}</div>
          </div>
        );
      })}
      </div>
      </section>
    )}

    {similar.length > 0 && (
      <section className={styles.section}>
      <h2 className={styles.sectionTitle}>More Like This</h2>
      <div className={styles.similarGrid}>
      {similar.map((item, idx) => {
        const isFocused = focusedSection === similarIndex && focusedItem === idx;
        return (
          <div
          key={`${item.mediaType}-${item.id}`}
          className={`${styles.similarCard} ${isFocused ? styles.focused : ''}`}
          onClick={() => handleSelectSimilar(item)}
          onKeyDown={(e) => handleSimilarKeyDown(e, idx)}
          role="button"
          tabIndex={isFocused ? 0 : -1}
          data-section={similarIndex} data-item={idx}
          >
          {item.posterPath ? (
            <img
            src={`${TMDB_IMAGE}/w342${item.posterPath}`}
            alt={item.title}
            className={styles.similarPoster}
            />
          ) : (
            <div className={styles.similarPlaceholder}>{item.title}</div>
          )}
          </div>
        );
      })}
      </div>
      </section>
    )}
    </div>
    </div>
  );
}
