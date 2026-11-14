import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Gamepad,
  Heart,
  ExternalLink,
  Trash2,
  DownloadCloud,
  ShoppingBag,
  Loader2,
  Calendar,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import { WishlistItem } from '../types';
import { GameModal } from '../components/GameModal';

export const Wishlist: React.FC = () => {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadWishlist();
  }, []);

  const loadWishlist = async () => {
    try {
      setLoading(true);
      const res = await api.get('/wishlist');
      setItems(res.data.items || []);
    } catch (err) {
      console.error('Failed to load wishlist', err);
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (id: number) => {
    try {
      await api.delete(`/wishlist/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Failed to remove item', err);
    }
  };

  const handleTorrentSearch = (title: string) => {
    // Open torrents page with prefilled search or open tracker
    navigate(`/torrents?search=${encodeURIComponent(title)}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Heart className="w-7 h-7 text-pink-500 fill-pink-500/20" />
            Список желаемого
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Сохраненные игры: сравнивайте цены KZT/RUB, проверяйте ProtonDB или загружайте торренты.
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-steam-card text-steam-accent border border-steam-border self-start sm:self-auto">
          Всего в списке: {items.length}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 text-steam-blue animate-spin mb-3" />
          <p className="text-sm">Загрузка списка желаемого...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-steam-card/40 rounded-2xl border border-steam-border/70 p-8">
          <div className="w-16 h-16 rounded-2xl bg-steam-cardHover/70 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Heart className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Ваш список желаемого пуст</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Добавляйте понравившиеся игры из каталога Discover, чтобы быстро отслеживать цены, ProtonDB и переходить к торрентам.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all"
          >
            <Gamepad className="w-4 h-4" />
            <span>Перейти в каталог игр</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => {
            const appIdNum = parseInt(item.app_id, 10);
            return (
              <div
                key={item.id}
                onClick={() => setSelectedAppId(appIdNum)}
                className="group rounded-2xl bg-steam-card/90 hover:bg-steam-card border border-steam-border/80 hover:border-steam-blue/60 overflow-hidden shadow-md hover:shadow-xl hover:shadow-steam-blue/10 hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between cursor-pointer"
              >
                <div>
                  {/* Banner cover */}
                  <div className="relative aspect-[16/8] w-full bg-slate-900 overflow-hidden">
                    <img
                      src={
                        item.img_url ||
                        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${item.app_id}/header.jpg`
                      }
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 right-2 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(item.id);
                        }}
                        className="p-1.5 rounded-lg bg-black/70 hover:bg-red-600 text-white backdrop-blur-sm border border-white/10 transition-colors shadow-md"
                        title="Удалить из списка"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="absolute bottom-2 left-2 z-10">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/70 text-slate-300 border border-white/10 backdrop-blur-sm">
                        AppID: {item.app_id}
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-base text-white group-hover:text-steam-accent line-clamp-1 transition-colors">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                      {item.release_date ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" /> {item.release_date}
                        </span>
                      ) : (
                        <span className="text-slate-500">Нажмите на карточку для открытия инфо</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions footer */}
                <div className="p-3 sm:p-4 pt-0 grid grid-cols-3 gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAppId(appIdNum);
                    }}
                    className="flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1.5 sm:px-2.5 rounded-xl bg-steam-nav hover:bg-steam-cardHover text-slate-200 hover:text-white border border-steam-border font-semibold transition-colors cursor-pointer"
                    title="Открыть подробную карточку (цены KZ/RU, ProtonDB, скриншоты)"
                  >
                    <Info className="w-3.5 h-3.5 text-steam-blue flex-shrink-0" />
                    <span>Инфо</span>
                  </button>

                  <a
                    href={`https://store.steampowered.com/app/${item.app_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1.5 sm:px-2.5 rounded-xl bg-steam-nav hover:bg-steam-cardHover text-slate-200 hover:text-white border border-steam-border font-semibold transition-colors cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-steam-accent flex-shrink-0" />
                    <span>Steam</span>
                    <ExternalLink className="w-2.5 h-2.5 text-slate-400 hidden sm:inline" />
                  </a>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTorrentSearch(item.title);
                    }}
                    className="flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1.5 sm:px-2.5 rounded-xl bg-steam-nav hover:bg-steam-cardHover text-slate-200 hover:text-white border border-steam-border font-semibold transition-colors cursor-pointer"
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-steam-cyan flex-shrink-0" />
                    <span>Торрент</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal with prices, ProtonDB status, screenshots and Steam store link */}
      <GameModal
        appId={selectedAppId}
        onClose={() => setSelectedAppId(null)}
        showWishlistButton={false}
      />
    </div>
  );
};
