import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import LlamadoCard from '@/components/LlamadoCard';
import LlamadoDetailModal from '@/components/LlamadoDetailModal';
import { Loader2, AlertCircle, RefreshCw, Search, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import MultiSelectFilter from '@/components/MultiSelectFilter';

const ORGANISMOS_KEY = 'comprasuy.llamados.organismos';
const PALABRAS_KEY = 'comprasuy.llamados.palabras';
const PAGINA = 60;

// Sin tildes ni mayúsculas, para que "licitacion" encuentre "Licitación".
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const textoLlamado = (l) => normalizar(`${l.titulo} ${l.organismo} ${String(l.descripcion_completa || '').replace(/<[^>]+>/g, ' ')}`);

const leerLista = (key) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const LlamadosView = () => {
  const { user } = useAuth();
  const [llamados, setLlamados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Organismos marcados (vacío = todos). Se recuerda en este navegador.
  const [selectedOrganismos, setSelectedOrganismos] = useState(() => leerLista(ORGANISMOS_KEY));
  // Palabras clave de Configuración → Filtros; las marcadas filtran (alcanza con que coincida una).
  const [palabrasClave, setPalabrasClave] = useState([]);
  const [selectedPalabras, setSelectedPalabras] = useState(() => leerLista(PALABRAS_KEY));
  useEffect(() => {
    try {
      localStorage.setItem(ORGANISMOS_KEY, JSON.stringify(selectedOrganismos));
      localStorage.setItem(PALABRAS_KEY, JSON.stringify(selectedPalabras));
    } catch {
      /* sin almacenamiento: el filtro igual funciona */
    }
  }, [selectedOrganismos, selectedPalabras]);
  useEffect(() => {
    supabase.from('palabras_clave_llamados').select('palabra').then(({ data, error }) => {
      if (error) return console.warn('No se pudieron cargar las palabras clave:', error.message);
      const lista = [...new Set((data || []).map((p) => String(p.palabra || '').trim()).filter(Boolean))];
      setPalabrasClave(lista.sort((a, b) => a.localeCompare(b, 'es')));
    });
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  // Se dibujan de a tandas: el feed puede traer cerca de mil llamados vigentes.
  const [visibles, setVisibles] = useState(PAGINA);
  const [selectedLlamado, setSelectedLlamado] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savedOpportunityIds, setSavedOpportunityIds] = useState(new Set());
  const { toast } = useToast();

  const fetchSavedOpportunities = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('llamados')
        .select('id')
        .eq('user_id', user.id);

      if (error) throw error;

      const savedIds = new Set(data.map(item => item.id.split('-user-')[0]));
      setSavedOpportunityIds(savedIds);
    } catch (error) {
      console.error('Error fetching saved opportunities:', error);
    }
  }, [user]);

  const fetchFromRss = async (silent = false) => {
    setLoading(true);
    setIsRefreshing(true);
    setError(null);
    if (!silent) {
        toast({ title: '🔄 Buscando en el RSS...', description: 'Cargando llamados abiertos desde Compras Estatales.' });
    }
    try {
        await fetchSavedOpportunities();
        const { data, error: functionError } = await supabase.functions.invoke('fetch-llamados-rss');

        if (functionError) {
          throw new Error(`Error al contactar el servicio RSS: ${functionError.message}`);
        }

        if (data.error) {
          throw new Error(`Error en el feed RSS: ${data.error}`);
        }

        if (data.llamados) {
            setLlamados(data.llamados);
            if (!silent) {
                toast({ title: '✅ ¡Llamados cargados!', description: `Se encontraron ${data.llamados.length} llamados abiertos.` });
            }
        } else {
             setLlamados([]);
             throw new Error("El feed RSS no devolvió datos en el formato esperado.");
        }

    } catch (e) {
        setError(e);
        if (!silent) {
            toast({ variant: 'destructive', title: '❌ Error al cargar RSS', description: e.message });
        }
        console.error("Error fetching from RSS:", e);
    } finally {
        setLoading(false);
        setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFromRss(true);
  }, [fetchSavedOpportunities]);

  const { organismosUnicos, conteoOrganismos } = useMemo(() => {
    const conteo = {};
    for (const l of llamados || []) if (l.organismo) conteo[l.organismo] = (conteo[l.organismo] || 0) + 1;
    // Los marcados que ya no aparecen en el RSS siguen en la lista para poder desmarcarlos.
    const nombres = new Set([...Object.keys(conteo), ...selectedOrganismos]);
    return {
      organismosUnicos: Array.from(nombres).sort((a, b) => a.localeCompare(b, 'es')),
      conteoOrganismos: conteo,
    };
  }, [llamados, selectedOrganismos]);

  // Qué palabras clave aparecen en cada llamado (para el conteo, el filtro y las etiquetas).
  const coincidencias = useMemo(() => {
    const normalizadas = palabrasClave.map((p) => [p, normalizar(p)]);
    const map = new Map();
    for (const l of llamados || []) {
      const texto = textoLlamado(l);
      map.set(l.id, normalizadas.filter(([, n]) => texto.includes(n)).map(([p]) => p));
    }
    return map;
  }, [llamados, palabrasClave]);

  const conteoPalabras = useMemo(() => {
    const conteo = {};
    for (const lista of coincidencias.values()) for (const p of lista) conteo[p] = (conteo[p] || 0) + 1;
    return conteo;
  }, [coincidencias]);

  const togglePalabra = (palabra) =>
    setSelectedPalabras((prev) => (prev.includes(palabra) ? prev.filter((p) => p !== palabra) : [...prev, palabra]));

  const filteredLlamados = useMemo(() => {
    if (!llamados) return [];
    let result = llamados;

    const activas = selectedPalabras.filter((p) => palabrasClave.includes(p));
    if (activas.length > 0) {
      result = result.filter((l) => (coincidencias.get(l.id) || []).some((p) => activas.includes(p)));
    }

    if (selectedOrganismos.length > 0) {
      const marcados = new Set(selectedOrganismos);
      result = result.filter(l => marcados.has(l.organismo));
    }

    if (searchTerm.trim()) {
        const termino = normalizar(searchTerm.trim());
        result = result.filter(l => textoLlamado(l).includes(termino));
    }

    return result;
  }, [llamados, selectedOrganismos, searchTerm, selectedPalabras, palabrasClave, coincidencias]);

  useEffect(() => setVisibles(PAGINA), [searchTerm, selectedOrganismos, selectedPalabras]);

  const handleViewOriginal = (llamado) => {
    if (llamado.link) {
      window.open(llamado.link, '_blank', 'noopener,noreferrer');
    } else {
      toast({
        variant: 'destructive',
        title: 'No hay link disponible',
      });
    }
  };

  const handleAnalyzeWithAI = (llamado) => {
    setSelectedLlamado(llamado);
    setIsModalOpen(true);
  };

  const handleSaveToDb = async (llamado, itemsExtraidos) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debes estar logueado para guardar.' });
      return;
    }

    toast({ title: '💾 Guardando oportunidad...', description: 'Por favor, espera un momento.' });

    try {
      const publicRecordId = llamado.id;
      const userOpportunityId = `${publicRecordId}-user-${user.id}`;

      const userOpportunityData = {
        ...llamado,
        id: userOpportunityId,
        user_id: user.id,
        items: itemsExtraidos || llamado.items || null,
        estado: 'Pendiente'
      };

      const { error } = await supabase
        .from('llamados')
        .upsert(userOpportunityData, { onConflict: 'id' });

      if (error) throw error;

      setSavedOpportunityIds(prev => new Set(prev).add(publicRecordId));
      toast({ title: '✅ ¡Oportunidad guardada!', description: 'Puedes verla en la sección de Oportunidades.' });

    } catch (error) {
      console.error("Error saving to DB:", error);
      toast({ variant: 'destructive', title: '❌ Error al guardar', description: error.message });
    }
  };


  const handleItemsExtracted = (items) => {
    if (selectedLlamado) {
      handleSaveToDb(selectedLlamado, items);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
          <span className="ml-4 text-slate-500">Buscando llamados vigentes...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-red-50 border border-red-200 rounded-2xl">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-red-800 mb-2">Error al Cargar Datos del RSS</h3>
          <p className="text-red-600 mb-4">{error.message}</p>
          <Button onClick={() => fetchFromRss(false)}><RefreshCw className="mr-2 h-4 w-4" /> Reintentar</Button>
        </div>
      );
    }

    if (filteredLlamados.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">No se encontraron llamados</h3>
                <p className="text-slate-500">El feed RSS no contiene llamados que coincidan con tus filtros o está vacío.</p>
                 <Button onClick={() => fetchFromRss(false)} className="mt-4"><RefreshCw className="mr-2 h-4 w-4" /> Volver a consultar RSS</Button>
            </div>
        );
    }

    return (
      <div className="space-y-4">
        {filteredLlamados.slice(0, visibles).map((llamado, index) => (
          <LlamadoCard
            key={llamado.id}
            llamado={llamado}
            index={index}
            isSaved={savedOpportunityIds.has(llamado.id)}
            palabrasClave={coincidencias.get(llamado.id)}
            onViewOriginal={() => handleViewOriginal(llamado)}
            onAnalyzeWithAI={() => handleAnalyzeWithAI(llamado)}
            onSaveToDb={() => handleSaveToDb(llamado, null)}
          />
        ))}
        {filteredLlamados.length > visibles && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setVisibles((v) => v + PAGINA)}>
              Mostrar más ({filteredLlamados.length - visibles} restantes)
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <div className="relative w-full sm:w-1/3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                    placeholder="Buscar por título, organismo o descripción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>
            <div className="w-full sm:w-auto">
                <MultiSelectFilter
                  options={organismosUnicos}
                  selected={selectedOrganismos}
                  onChange={setSelectedOrganismos}
                  counts={conteoOrganismos}
                  allLabel="Todos los organismos"
                  pluralLabel="organismos"
                  searchPlaceholder="Buscar organismo…"
                  disabled={loading || !!error}
                  className="sm:w-[300px]"
                />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
                <Button onClick={() => fetchFromRss(false)} disabled={isRefreshing} className="flex-grow sm:flex-grow-0">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Actualizar RSS
                </Button>
            </div>
        </div>
        {palabrasClave.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-semibold text-slate-600 mr-1">
              <Tag className="h-4 w-4" /> Palabras clave:
            </span>
            {palabrasClave.map((palabra) => {
              const activa = selectedPalabras.includes(palabra);
              return (
                <button
                  key={palabra}
                  type="button"
                  onClick={() => togglePalabra(palabra)}
                  aria-pressed={activa}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                    activa ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand'
                  }`}
                >
                  {palabra}
                  <span className={`ml-1.5 text-xs tabular-nums ${activa ? 'text-white/80' : 'text-slate-400'}`}>{conteoPalabras[palabra] || 0}</span>
                </button>
              );
            })}
            {selectedPalabras.length > 0 && (
              <button type="button" onClick={() => setSelectedPalabras([])} className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-ink">
                <X className="h-4 w-4" /> Quitar
              </button>
            )}
          </div>
        )}
        {!loading && !error && (
          <p className="mb-3 text-sm text-slate-500">
            {filteredLlamados.length === llamados.length
              ? `${llamados.length} llamados vigentes (apertura posterior a hoy)`
              : `${filteredLlamados.length} de ${llamados.length} llamados vigentes`}
          </p>
        )}
        {renderContent()}
      </motion.div>
      <LlamadoDetailModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedLlamado(null);
        }}
        llamado={selectedLlamado}
        onViewOriginal={handleViewOriginal}
        onItemsExtracted={handleItemsExtracted}
      />
    </>
  );
};

export default LlamadosView;