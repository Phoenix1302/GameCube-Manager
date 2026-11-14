import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  FolderTree,
  Folder,
  FileText,
  FileCode,
  FileArchive,
  FileImage,
  File,
  ArrowLeft,
  Upload,
  FolderPlus,
  Trash2,
  Edit3,
  Download,
  Save,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Gamepad2,
  DownloadCloud,
  HardDrive,
} from 'lucide-react';
import { api } from '../services/api';
import { FileItem } from '../types';

export const AdminFiles: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [rootPath, setRootPath] = useState<string>('');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor modal state
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [savingFile, setSavingFile] = useState(false);

  // New folder state
  const [showMkdir, setShowMkdir] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Rename state
  const [renamingItem, setRenamingItem] = useState<{ oldPath: string; oldName: string } | null>(null);
  const [newFileName, setNewFileName] = useState('');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);

  // Drag and Drop Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const initialPath = searchParams.get('path');
    loadFiles(initialPath || currentPath);
  }, [searchParams]);

  const loadFiles = async (targetPath: string) => {
    try {
      setLoading(true);
      const res = await api.get('/files/list', { params: { path: targetPath || undefined } });
      setCurrentPath(res.data.currentPath);
      setParentPath(res.data.parentPath);
      setRootPath(res.data.root);
      setItems(res.data.items || []);
    } catch (err: any) {
      alert(`Ошибка чтения директории: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openItem = (item: FileItem) => {
    if (item.isDirectory) {
      loadFiles(item.path);
    } else {
      openEditor(item.path, item.name);
    }
  };

  const openEditor = async (filePath: string, fileName: string) => {
    try {
      const res = await api.get('/files/read', { params: { path: filePath } });
      setEditingFile({
        path: filePath,
        name: fileName,
        content: res.data.content,
      });
    } catch (err: any) {
      alert(`Не удалось открыть файл: ${err.response?.data?.error || err.message}`);
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    try {
      setSavingFile(true);
      await api.post('/files/write', {
        path: editingFile.path,
        content: editingFile.content,
      });
      setEditingFile(null);
      loadFiles(currentPath);
    } catch (err: any) {
      alert(`Ошибка сохранения файла: ${err.response?.data?.error || err.message}`);
    } finally {
      setSavingFile(false);
    }
  };

  const handleMkdir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const newPath = `${currentPath}/${newFolderName.trim()}`.replace(/\/+/g, '/');
      await api.post('/files/mkdir', { path: newPath });
      setNewFolderName('');
      setShowMkdir(false);
      loadFiles(currentPath);
    } catch (err: any) {
      alert(`Ошибка создания папки: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingItem || !newFileName.trim()) return;
    try {
      const parentDir = currentPath;
      const targetNewPath = `${parentDir}/${newFileName.trim()}`.replace(/\/+/g, '/');
      await api.post('/files/rename', {
        oldPath: renamingItem.oldPath,
        newPath: targetNewPath,
      });
      setRenamingItem(null);
      setNewFileName('');
      loadFiles(currentPath);
    } catch (err: any) {
      alert(`Ошибка переименования: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete('/files', { params: { path: deleteTarget.path } });
      setDeleteTarget(null);
      loadFiles(currentPath);
    } catch (err: any) {
      alert(`Ошибка удаления: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('targetDir', currentPath);
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await api.post('/files/upload', formData);
      loadFiles(currentPath);
    } catch (err: any) {
      alert(`Ошибка загрузки файлов: ${err.response?.data?.error || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (item: FileItem) => {
    if (item.isDirectory) return <Folder className="w-5 h-5 text-amber-400 fill-amber-400/20" />;
    const ext = item.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'json':
      case 'js':
      case 'ts':
      case 'sh':
      case 'py':
      case 'yaml':
      case 'yml':
      case 'conf':
      case 'service':
      case 'container':
        return <FileCode className="w-5 h-5 text-steam-cyan" />;
      case 'zip':
      case 'tar':
      case 'gz':
      case 'xz':
      case '7z':
      case 'iso':
        return <FileArchive className="w-5 h-5 text-amber-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'svg':
        return <FileImage className="w-5 h-5 text-pink-400" />;
      case 'txt':
      case 'log':
      case 'md':
      case 'vdf':
        return <FileText className="w-5 h-5 text-slate-300" />;
      default:
        return <File className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleUploadFiles(e.dataTransfer.files);
      }}
    >
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <FolderTree className="w-7 h-7 text-steam-cyan" />
            Root Файловый менеджер
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Прямой доступ к файловой системе хоста и накопителям: просмотр, создание, редактирование и загрузка.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <label className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-steam-card hover:bg-steam-cardHover text-slate-200 border border-steam-border text-xs font-semibold cursor-pointer shadow-sm">
            <Upload className="w-4 h-4 text-steam-cyan" />
            <span>Загрузить файлы</span>
            <input
              type="file"
              multiple
              onChange={(e) => handleUploadFiles(e.target.files)}
              className="hidden"
            />
          </label>

          <button
            onClick={() => setShowMkdir(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-xs font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Новая папка</span>
          </button>
        </div>
      </div>

      {/* Quick Navigation Bookmarks Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none text-xs">
        <span className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider flex-shrink-0">
          Быстрый переход:
        </span>
        {[
          {
            label: 'Steam common',
            icon: Gamepad2,
            path: '/mnt/game_data/SteamLibrary/steamapps/common',
            color: 'text-steam-accent border-steam-accent/30 bg-steam-accent/10',
          },
          {
            label: 'Загрузки',
            icon: DownloadCloud,
            path: '/mnt/game_data/Downloads',
            color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
          },
          {
            label: 'Steam Userdata',
            icon: HardDrive,
            path: '/home/gamecube/.local/share/Steam/userdata',
            color: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10',
          },
          {
            label: 'Корень (Root)',
            icon: Folder,
            path: '/',
            color: 'text-slate-300 border-steam-border bg-steam-card',
          },
        ].map((bm) => {
          const Icon = bm.icon;
          return (
            <button
              key={bm.path}
              type="button"
              onClick={() => loadFiles(bm.path)}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-medium transition-all cursor-pointer whitespace-nowrap hover:scale-105 active:scale-95 ${bm.color}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{bm.label}</span>
            </button>
          );
        })}
      </div>

      {/* Drag & Drop Alert Overlay */}
      {isDragging && (
        <div className="mb-6 p-8 border-2 border-dashed border-steam-cyan bg-steam-cyan/10 rounded-2xl text-center text-steam-cyan font-bold animate-pulse">
          Отпустите файлы для загрузки в текущую директорию: {(currentPath || rootPath).replace(/^\/host_root/, '') || '/'}
        </div>
      )}

      {/* Breadcrumb Path Bar */}
      <div className="flex items-center gap-2 p-3 bg-steam-card border border-steam-border rounded-xl mb-6 overflow-x-auto text-xs font-mono">
        {parentPath !== null && (
          <button
            onClick={() => loadFiles(parentPath)}
            className="p-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-slate-300 hover:text-white mr-1 transition-colors cursor-pointer"
            title="Наверх"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <span className="text-slate-400">Путь:</span>
        <span className="text-steam-accent font-semibold">
          {(currentPath || rootPath).replace(/^\/host_root/, '') || '/'}
        </span>
      </div>

      {/* Directory Content Table */}
      {loading || uploading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 text-steam-cyan animate-spin mb-3" />
          <p className="text-sm">{uploading ? 'Загрузка файлов на сервер...' : 'Чтение каталога...'}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-steam-card/40 rounded-2xl border border-steam-border p-8">
          <Folder className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Директория пуста. Перетащите файлы сюда или создайте новую папку.</p>
        </div>
      ) : (
        <div className="bg-steam-card border border-steam-border/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-steam-nav text-xs uppercase text-slate-400 font-semibold border-b border-steam-border">
                <tr>
                  <th className="px-5 py-3.5">Имя</th>
                  <th className="px-5 py-3.5">Размер</th>
                  <th className="px-5 py-3.5">Права</th>
                  <th className="px-5 py-3.5">Изменен</th>
                  <th className="px-5 py-3.5 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steam-border/50">
                {items.map((item) => (
                  <tr
                    key={item.path}
                    className="hover:bg-steam-cardHover/60 transition-colors group cursor-pointer"
                    onClick={() => openItem(item)}
                  >
                    <td className="px-5 py-3.5 flex items-center gap-3">
                      {getFileIcon(item)}
                      <span className="font-medium text-slate-100 group-hover:text-steam-accent transition-colors">
                        {item.name}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                      {item.isDirectory ? '—' : formatBytes(item.size)}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                      {item.permissions}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(item.mtime).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!item.isDirectory && (
                          <a
                            href={`/api/files/download?path=${encodeURIComponent(item.path)}`}
                            download
                            className="p-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-slate-300 hover:text-white transition-colors"
                            title="Скачать"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}

                        <button
                          onClick={() => {
                            setRenamingItem({ oldPath: item.path, oldName: item.name });
                            setNewFileName(item.name);
                          }}
                          className="p-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-slate-300 hover:text-white transition-colors"
                          title="Переименовать"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-1.5 rounded-lg bg-steam-nav hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* File Editor Modal */}
      {editingFile && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setEditingFile(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[88vh] my-auto bg-steam-nav border border-steam-border/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-left"
          >
            <div className="p-3.5 sm:p-4 border-b border-steam-border/80 flex items-center justify-between bg-steam-card/90">
              <div className="flex items-center gap-2 overflow-hidden mr-2">
                <FileCode className="w-5 h-5 text-steam-cyan flex-shrink-0" />
                <span className="font-bold text-white text-xs sm:text-sm font-mono truncate max-w-xs sm:max-w-md">
                  {editingFile.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={saveFile}
                  disabled={savingFile}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingFile ? 'Сохранение...' : 'Сохранить'}</span>
                </button>
                <button
                  onClick={() => setEditingFile(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  title="Закрыть"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-2 bg-[#090d13] overflow-hidden">
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                className="w-full h-full bg-transparent text-slate-200 font-mono text-xs sm:text-sm p-3 focus:outline-none resize-none selection:bg-steam-blue selection:text-white"
                spellCheck={false}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* New Folder Modal */}
      {showMkdir && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowMkdir(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl p-5 sm:p-6 shadow-2xl text-left"
          >
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-steam-blue" />
              Создание новой папки
            </h3>
            <form onSubmit={handleMkdir} className="space-y-4">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Имя папки"
                autoFocus
                required
                className="w-full bg-steam-card text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
              />
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setShowMkdir(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-steam-card hover:bg-steam-cardHover transition-colors cursor-pointer text-center"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-steam-blue hover:bg-steam-blueHover shadow-md shadow-blue-500/20 transition-all cursor-pointer text-center"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Rename Modal */}
      {renamingItem && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setRenamingItem(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl p-5 sm:p-6 shadow-2xl text-left"
          >
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-steam-cyan" />
              Переименование
            </h3>
            <form onSubmit={handleRename} className="space-y-4">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                autoFocus
                required
                className="w-full bg-steam-card text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
              />
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setRenamingItem(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-steam-card hover:bg-steam-cardHover transition-colors cursor-pointer text-center"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-steam-blue hover:bg-steam-blueHover shadow-md shadow-blue-500/20 transition-all cursor-pointer text-center"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setDeleteTarget(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl p-5 sm:p-6 shadow-2xl text-left"
          >
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Подтверждение удаления
            </h3>
            <p className="text-sm text-slate-300 mb-5 leading-relaxed">
              Вы действительно хотите безвозвратно удалить <strong className="text-white">{deleteTarget.name}</strong>?
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-steam-card hover:bg-steam-cardHover transition-colors cursor-pointer text-center"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 transition-all cursor-pointer text-center"
              >
                Удалить навсегда
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
