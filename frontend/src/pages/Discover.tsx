import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad,
  Search,
  Sparkles,
  Heart,
  ExternalLink,
  Flame,
  Award,
  Check,
  X,
  Loader2,
  Tag,
  Monitor,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  PlusCircle,
  Gamepad2,
  LayoutGrid,
  Users,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { api } from '../services/api';
import { Game } from '../types';
import { GameModal } from '../components/GameModal';

const GameImage: React.FC<{ src: string; alt: string; appId: number }> = ({ src, alt, appId }) => {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [attempt, setAttempt] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setAttempt(0);
    setHasError(false);
  }, [src]);

  const handleError = () => {
    if (attempt === 0) {
      setAttempt(1);
      setCurrentSrc(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`);
    } else if (attempt === 1) {
      setAttempt(2);
      setCurrentSrc(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`);
    } else if (attempt === 2) {
      setAttempt(3);
      setCurrentSrc(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`);
    } else if (attempt === 3) {
      setAttempt(4);
      setCurrentSrc(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`);
    } else if (attempt === 4) {
      setAttempt(5);
      setCurrentSrc(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`);
    } else {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-2 text-center border border-steam-border/60">
        <Gamepad2 className="w-8 h-8 text-steam-accent/60 mb-1" />
        <span className="text-[11px] font-semibold text-slate-300 line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-slate-950">
      {/* Blurred background glow so banner edges are pleasant without cutting off foreground */}
      <img
        src={currentSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110 pointer-events-none select-none"
      />
      {/* Crisp centered main image with NO cropping */}
      <img
        src={currentSrc}
        alt={alt}
        onError={handleError}
        className="relative z-10 w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
      />
    </div>
  );
};

export const Discover: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'topSellers' | 'newReleases' | 'specials' | 'featured'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('gamecube_page_size');
    return saved ? parseInt(saved, 10) : 24;
  });
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedPlayerMode, setSelectedPlayerMode] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedSort, setSelectedSort] = useState('');

  // Modal & Toast State
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [wishlistSuccess, setWishlistSuccess] = useState<string | null>(null);

  // Steam Live Autocomplete / Suggestions State
  const [suggestions, setSuggestions] = useState<Array<{
    id: number;
    name: string;
    img: string;
    price: string;
    isFree: boolean;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced fetch for Steam suggestions
  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSuggesting(true);
        const res = await api.get('/games/suggest', { params: { term } });
        if (res.data?.suggestions) {
          setSuggestions(res.data.suggestions);
          setShowSuggestions(res.data.suggestions.length > 0);
        }
      } catch (err) {
        console.error('Failed to fetch Steam suggestions', err);
      } finally {
        setIsSuggesting(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load games whenever activeTab, page, pageSize, or filters change
  useEffect(() => {
    loadGames(page, false);
  }, [activeTab, page, pageSize, selectedGenre, selectedPlayerMode, selectedPlatform, selectedSort]);

  const loadGames = async (targetPage: number, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const res = await api.get('/games/browse', {
        params: {
          category: activeTab,
          page: targetPage,
          limit: pageSize,
          q: searchQuery.trim(),
          genre: selectedGenre,
          playerMode: selectedPlayerMode,
          os: selectedPlatform,
          sort: selectedSort,
        },
      });

      const newItems: Game[] = res.data.items || [];
      setTotalCount(res.data.total || 0);
      setHasMore(res.data.hasMore ?? newItems.length >= pageSize);

      if (append) {
        setGames((prev) => {
          const existingIds = new Set(prev.map((g) => g.id));
          const filtered = newItems.filter((g) => !existingIds.has(g.id));
          return [...prev, ...filtered];
        });
      } else {
        setGames(newItems);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      console.error('Failed to load games', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleTabChange = (tabId: 'all' | 'topSellers' | 'newReleases' | 'specials' | 'featured') => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
    setPage(1);
    setSearchQuery('');
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    localStorage.setItem('gamecube_page_size', String(newSize));
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadGames(1, false);
  };

  const handleResetFilters = () => {
    setSelectedGenre('');
    setSelectedPlayerMode('');
    setSelectedPlatform('');
    setSelectedSort('');
    setPage(1);
  };

  const activeFiltersCount = [selectedGenre, selectedPlayerMode, selectedPlatform, selectedSort].filter(Boolean).length;

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadGames(nextPage, true);
  };

  const addToWishlist = async (game: { id: number; name: string; headerImage?: string }) => {
    try {
      await api.post('/wishlist', {
        appId: game.id,
        title: game.name,
        imgUrl: game.headerImage,
      });
      setWishlistSuccess(`«${game.name}» добавлена в список желаемого!`);
      setTimeout(() => setWishlistSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to add to wishlist', err);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      {/* Hero header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Gamepad className="w-7 h-7 text-steam-accent" />
            Каталог игр Steam
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Исследуйте полный каталог, новинки и скидки. Сравнивайте цены в Казахстане и РФ, проверяйте статус на ProtonDB.
          </p>
        </div>

        {/* Search Bar with Steam Live Suggestions */}
        <div ref={searchContainerRef} className="relative w-full md:w-96">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
              placeholder="Поиск по Steam (название, серия)..."
              className="w-full bg-steam-card/90 text-slate-100 placeholder-slate-400 text-sm rounded-xl pl-10 pr-10 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue focus:ring-1 focus:ring-steam-blue shadow-inner"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            {isSuggesting ? (
              <Loader2 className="w-4 h-4 text-steam-blue animate-spin absolute right-3.5 top-3.5" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setShowSuggestions(false);
                  setPage(1);
                }}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </form>

          {/* Steam Live Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-slate-900/98 backdrop-blur-xl border border-steam-border/90 rounded-2xl shadow-2xl overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-white/5 flex items-center justify-between">
                <span>Подходящие варианты Steam</span>
                <span className="text-[10px] text-slate-500 font-mono">Нажмите для деталей</span>
              </div>
              <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                {suggestions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedAppId(item.id);
                      setShowSuggestions(false);
                    }}
                    className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-steam-blue/20 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.img}
                        alt={item.name}
                        className="w-14 h-6 object-cover rounded shadow-sm bg-slate-950 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${item.id}/capsule_231x87.jpg`;
                        }}
                      />
                      <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          item.isFree
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {item.price}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div
                onClick={(e) => {
                  setShowSuggestions(false);
                  handleSearch(e as any);
                }}
                className="px-3.5 py-2 text-xs text-steam-accent hover:bg-slate-800/80 cursor-pointer border-t border-white/5 flex items-center justify-between transition-colors"
              >
                <span>Искать все результаты по «{searchQuery}»</span>
                <span className="font-mono text-[11px] text-slate-500">↵ Enter</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        {/* Category Tabs including "Все игры" */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'Все игры', icon: LayoutGrid },
            { id: 'topSellers', label: 'Лидеры продаж', icon: Flame },
            { id: 'newReleases', label: 'Новинки', icon: Sparkles },
            { id: 'specials', label: 'Скидки и акции', icon: Tag },
            { id: 'featured', label: 'Выбор Steam', icon: Award },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-steam-blue to-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30'
                    : 'bg-steam-card/80 text-slate-300 hover:bg-steam-cardHover hover:text-white border border-steam-border/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right tools: Filters toggle & Page Size */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">
          {/* Filter button */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showFilters || activeFiltersCount > 0
                ? 'bg-steam-blue/20 text-steam-accent border-steam-blue/50 shadow-sm'
                : 'bg-steam-card text-slate-300 hover:text-white border-steam-border hover:bg-steam-cardHover'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Фильтры</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-steam-blue text-white text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Page size selector */}
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-steam-card/70 px-3 py-1.5 rounded-xl border border-steam-border/60">
            <SlidersHorizontal className="w-3.5 h-3.5 text-steam-accent" />
            <span>Показывать:</span>
            <div className="flex items-center gap-1 font-mono">
              {[12, 24, 36, 48].map((size) => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                    pageSize === size
                      ? 'bg-steam-blue text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Steam Filter Panel (Collapsible) */}
      {showFilters && (
        <div className="mb-6 p-4 rounded-2xl bg-steam-card/90 border border-steam-border/80 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-steam-border/60">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Filter className="w-4 h-4 text-steam-cyan" />
              <span>Фильтры каталога Steam</span>
            </div>
            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить фильтры</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Genre Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-steam-blue" />
                Жанр
              </label>
              <select
                value={selectedGenre}
                onChange={(e) => {
                  setSelectedGenre(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-steam-nav text-slate-200 text-xs rounded-xl px-3 py-2 border border-steam-border focus:outline-none focus:border-steam-blue"
              >
                <option value="">Все жанры</option>
                <option value="19">Экшен (Action)</option>
                <option value="122">Ролевые (RPG)</option>
                <option value="9">Стратегии (Strategy)</option>
                <option value="599">Симуляторы (Simulation)</option>
                <option value="21">Приключения (Adventure)</option>
                <option value="1774">Шутеры (Shooter)</option>
                <option value="492">Инди (Indie)</option>
                <option value="1667">Хорроры (Horror)</option>
                <option value="699">Гонки (Racing)</option>
                <option value="701">Спорт (Sports)</option>
              </select>
            </div>

            {/* Players Mode Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-steam-cyan" />
                Количество игроков
              </label>
              <select
                value={selectedPlayerMode}
                onChange={(e) => {
                  setSelectedPlayerMode(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-steam-nav text-slate-200 text-xs rounded-xl px-3 py-2 border border-steam-border focus:outline-none focus:border-steam-blue"
              >
                <option value="">Все режимы</option>
                <option value="2">Одиночная игра (Singleplayer)</option>
                <option value="1">Мультиплеер (Multiplayer)</option>
                <option value="9">Кооператив (Co-op)</option>
                <option value="49">PvP / Соревнования</option>
                <option value="24">Локальный кооператив / Сплитскрин</option>
              </select>
            </div>

            {/* Platform Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                Платформа / Совместимость
              </label>
              <select
                value={selectedPlatform}
                onChange={(e) => {
                  setSelectedPlatform(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-steam-nav text-slate-200 text-xs rounded-xl px-3 py-2 border border-steam-border focus:outline-none focus:border-steam-blue"
              >
                <option value="">Все платформы</option>
                <option value="linux">SteamOS / Linux (Proton)</option>
                <option value="win">Windows</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                Сортировка
              </label>
              <select
                value={selectedSort}
                onChange={(e) => {
                  setSelectedSort(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-steam-nav text-slate-200 text-xs rounded-xl px-3 py-2 border border-steam-border focus:outline-none focus:border-steam-blue"
              >
                <option value="">По популярности / релевантности</option>
                <option value="Released_DESC">По дате выхода (Новинки)</option>
                <option value="Reviews_DESC">По оценкам игроков</option>
                <option value="Price_ASC">Сначала недорогие</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Games Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-9 h-9 text-steam-blue animate-spin mb-3" />
          <p className="text-sm font-medium">Загрузка каталога игр...</p>
        </div>
      ) : games.length === 0 ? (
        <div className="text-center py-20 bg-steam-card/50 rounded-2xl border border-steam-border">
          <p className="text-slate-400 text-sm">Игры не найдены. Попробуйте изменить фильтры или поисковый запрос.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {games.map((game) => (
              <div
                key={`${game.id}-${game.name}`}
                onClick={() => setSelectedAppId(game.id)}
                className="group relative cursor-pointer rounded-2xl bg-steam-card/90 hover:bg-steam-card border border-steam-border/70 hover:border-steam-blue/70 overflow-hidden shadow-md hover:shadow-xl hover:shadow-steam-blue/15 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Clean Capsule Cover */}
                  <div className="relative aspect-[231/87] w-full bg-slate-950 overflow-hidden">
                    <GameImage src={game.headerImage} alt={game.name} appId={game.id} />

                    {/* Discount badge */}
                    {game.discountPercent && game.discountPercent > 0 ? (
                      <div className="absolute bottom-1.5 left-1.5 z-20 bg-steam-green text-white font-extrabold text-[11px] px-1.5 py-0.5 rounded shadow-md">
                        -{game.discountPercent}%
                      </div>
                    ) : null}

                    {/* Quick Wishlist Icon Button */}
                    <button
                      type="button"
                      title="Добавить в желаемое"
                      onClick={(e) => {
                        e.stopPropagation();
                        addToWishlist(game);
                      }}
                      className="absolute top-1.5 right-1.5 z-20 w-7 h-7 rounded-full bg-black/60 hover:bg-pink-600/90 text-slate-300 hover:text-white backdrop-blur-md border border-white/10 flex items-center justify-center transition-all shadow-md group/btn"
                    >
                      <Heart className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-steam-accent line-clamp-1 transition-colors">
                      {game.name}
                    </h3>

                    {/* Price and Steam badge row */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-steam-border/40 text-xs">
                      {game.discountPercent && game.discountPercent > 0 ? (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          {game.originalPrice ? (
                            <span className="text-[10px] text-slate-500 line-through truncate max-w-[65px]">
                              {typeof game.originalPrice === 'number' ? `${game.originalPrice}₸` : game.originalPrice}
                            </span>
                          ) : null}
                          <span className="font-bold text-steam-green text-xs">
                            {game.priceText || 'Скидка'}
                          </span>
                        </div>
                      ) : game.priceText && game.priceText !== 'Бесплатно' ? (
                        <span className="font-semibold text-slate-200 text-xs truncate max-w-[120px]">
                          {game.priceText}
                        </span>
                      ) : game.isFree || game.priceText === 'Бесплатно' ? (
                        <span className="text-cyan-400 text-xs font-semibold">
                          Бесплатно
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] font-medium">
                          В магазине Steam
                        </span>
                      )}

                      <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                        Steam
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination & Infinite Load Bar */}
          <div className="mt-8 sm:mt-10 pt-5 sm:pt-6 border-t border-steam-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
            {/* Status indicator */}
            <div className="text-xs text-slate-400 text-center sm:text-left">
              Показано <span className="font-bold text-slate-200">{games.length}</span> тайтлов • Страница <span className="font-bold text-slate-200">{page}</span> из {totalPages}
            </div>

            {/* Load More Button (Continuous Diving) */}
            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-steam-card hover:bg-steam-cardHover text-steam-cyan hover:text-cyan-300 border border-steam-cyan/40 hover:border-steam-cyan font-semibold text-xs transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-steam-cyan" />
                    <span>Загрузка следующих игр...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Загрузить ещё (+{pageSize} тайтлов)</span>
                  </>
                )}
              </button>
            )}

            {/* Pagination Controls */}
            <div className="flex items-center gap-1 justify-center">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors border border-steam-border"
                title="Первая страница"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors text-xs border border-steam-border font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Назад</span>
              </button>

              <span className="px-3 py-1 text-xs font-mono font-bold text-slate-300 bg-steam-nav rounded-lg border border-steam-border">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors text-xs border border-steam-border font-medium"
              >
                <span>Вперед</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors border border-steam-border"
                title="Последняя страница"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast Alert for Wishlist */}
      {wishlistSuccess && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900/95 text-emerald-300 border border-emerald-500/50 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-200">
          <Check className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-semibold">{wishlistSuccess}</span>
        </div>
      )}

      {/* Standalone Game Details Modal */}
      <GameModal
        appId={selectedAppId}
        onClose={() => setSelectedAppId(null)}
      />
    </div>
  );
};
