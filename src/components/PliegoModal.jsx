import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileDown, Loader2, Package, ClipboardCheck, Copy, Pencil, Save, RotateCcw, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { htmlToText } from 'html-to-text';
import { supabase } from '@/lib/customSupabaseClient';
import { Textarea } from '@/components/ui/textarea';
import { CONDICIONES_PLIEGO, datosEmpresa } from '@/lib/empresa';
import ItemsPliego, { calcularItemExtra } from '@/components/pliego/ItemsPliego';

const backdrop = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};

const modal = {
  hidden: { y: '100vh', opacity: 0 },
  visible: {
    y: '0',
    opacity: 1,
    transition: { delay: 0.1, type: 'spring', stiffness: 80, damping: 20 },
  },
};

const PliegoModal = ({ isOpen, onClose, llamado }) => {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const pliegoRef = useRef(null);
  // Datos de la empresa y firma (Configuración → Datos de la empresa).
  const [config, setConfig] = useState(null);
  const empresa = datosEmpresa(config);
  // Condiciones y aclaraciones: se editan para este pliego y se pueden dejar como predeterminadas.
  const [condiciones, setCondiciones] = useState(CONDICIONES_PLIEGO);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Ítems agregados a mano (con o sin precio). Se guardan solos en el llamado.
  const [extras, setExtras] = useState([]);
  const [verExtras, setVerExtras] = useState(false);
  const [estadoExtras, setEstadoExtras] = useState('');
  const extrasCargados = useRef(null);

  useEffect(() => {
    if (!isOpen || !llamado?.id) return;
    extrasCargados.current = null;
    setExtras([]);
    setEstadoExtras('');
    supabase.from('llamados').select('id, pliego_items').eq('id', llamado.id).maybeSingle().then(({ data, error }) => {
      if (error) console.warn('No se pudieron cargar los ítems del pliego:', error.message);
      const lista = Array.isArray(data?.pliego_items) ? data.pliego_items : [];
      extrasCargados.current = llamado.id;
      setExtras(lista);
      setVerExtras(lista.length > 0);
    });
  }, [isOpen, llamado?.id]);

  useEffect(() => {
    if (!isOpen || extrasCargados.current !== llamado?.id) return undefined;
    setEstadoExtras('Guardando…');
    const t = setTimeout(async () => {
      const { error } = await supabase.from('llamados').update({ pliego_items: extras }).eq('id', llamado.id);
      setEstadoExtras(error ? 'No se pudo guardar' : 'Guardado');
      if (error) toast({ variant: 'destructive', title: 'No se pudieron guardar los ítems del pliego', description: error.message });
    }, 800);
    return () => clearTimeout(t);
  }, [extras]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    setEditando(false);
    supabase.from('pliego_config').select('*').limit(1).maybeSingle().then(({ data, error }) => {
      if (error) console.warn('No se pudieron cargar los datos de la empresa:', error.message);
      setConfig(data || {});
      setCondiciones(data?.condiciones_pliego ?? CONDICIONES_PLIEGO);
    });
  }, [isOpen, llamado?.id]);

  const guardarPredeterminadas = async () => {
    setGuardando(true);
    const valores = { condiciones_pliego: condiciones };
    const { data, error } = config?.id
      ? await supabase.from('pliego_config').update(valores).eq('id', config.id).select().single()
      : await supabase.from('pliego_config').insert(valores).select().single();
    setGuardando(false);
    if (error) return toast({ variant: 'destructive', title: 'No se pudieron guardar', description: error.message });
    setConfig(data);
    toast({ title: '✅ Condiciones guardadas', description: 'Se van a usar en los próximos pliegos.' });
  };

  const handleCopyToWord = () => {
    if (!pliegoRef.current) return;
    const htmlContent = pliegoRef.current.innerHTML;
    
    try {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({ 'text/html': blob });
      navigator.clipboard.write([clipboardItem]);
      toast({
        title: '✅ Copiado para Word',
        description: 'El contenido del pliego está listo para pegar en Word.',
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      const textContent = htmlToText(htmlContent);
      navigator.clipboard.writeText(textContent);
      toast({
        title: '📋 Copiado como texto plano',
        description: 'No se pudo copiar con formato, se copió como texto sin formato.',
      });
    }
  };

  const handleExportToPDF = async () => {
    if (!pliegoRef.current) return;
    setIsExporting(true);
    toast({ title: '📄 Exportando a PDF...', description: 'Por favor, espera un momento.' });

    try {
      const canvas = await html2canvas(pliegoRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'letter',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps= pdf.getImageProperties(imgData);
      const imgWidth = imgProps.width;
      const imgHeight = imgProps.height;

      const ratio = imgWidth / imgHeight;
      let widthInPdf = pdfWidth - 20;
      let heightInPdf = widthInPdf / ratio;
      
      let heightLeft = heightInPdf;
      let position = 10;
      
      pdf.addImage(imgData, 'PNG', 10, position, widthInPdf, heightInPdf);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, widthInPdf, heightInPdf);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`Pliego-${llamado.id}.pdf`);
      toast({ title: '✅ ¡Exportación completa!', description: 'El pliego se ha guardado como PDF.' });
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      toast({ variant: 'destructive', title: '❌ Error de exportación', description: 'No se pudo generar el PDF.' });
    } finally {
      setIsExporting(false);
    }
  };
  
  if (!isOpen || !llamado) return null;

  const getShortTitle = (fullTitle) => {
    if (!fullTitle) return '';
    const hyphenIndex = fullTitle.indexOf('-');
    if (hyphenIndex !== -1) {
      return fullTitle.substring(0, hyphenIndex).trim();
    }
    return fullTitle;
  };

  const shortTitle = getShortTitle(llamado.titulo);
  
  const itemsToCalculate = llamado.presupuesto_items && llamado.presupuesto_items.length > 0 ? llamado.presupuesto_items : (llamado.items || []);

  const itemsCalculations = itemsToCalculate.map(item => {
    const cantidad = parseFloat(item.cantidad) || 0;
    const costoUnitarioItem = parseFloat(item.precio) || 0;
    const utilidad = parseFloat(item.utilidad) || 0;
    const ivaRate = parseFloat(item.iva) || 0;
    const fleteTotal = parseFloat(item.flete) || 0;
    
    const fleteUnitario = cantidad > 0 ? fleteTotal / cantidad : 0;
    const costoMasUtilidad = costoUnitarioItem * (1 + utilidad / 100);
    
    const precioUnitarioSinIva = costoMasUtilidad + fleteUnitario;
    const ivaUnitario = precioUnitarioSinIva * (ivaRate / 100);
    const precioUnitarioConIva = precioUnitarioSinIva + ivaUnitario;
    
    const totalItem = precioUnitarioConIva * cantidad;

    return { ...item, precioUnitarioSinIva, ivaUnitario, precioUnitarioConIva, totalItem };
  });

  const extrasCalculados = extras.filter((it) => (it.nombre || '').trim() || it.imagen).map(calcularItemExtra);
  const totalPresupuesto = [...itemsCalculations, ...extrasCalculados].reduce((sum, item) => sum + item.totalItem, 0);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4"
        variants={backdrop} initial="hidden" animate="visible" exit="hidden"
        onClick={onClose}
      >
        <motion.div
          className="bg-slate-100 border border-purple-500/50 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col dark:bg-slate-800/80"
          variants={modal} onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-200 flex justify-between items-center flex-shrink-0 dark:border-slate-700">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Preparación de Pliego</h2>
              <p className="text-sm text-slate-500 mt-1 truncate max-w-md dark:text-gray-400">{llamado.titulo}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleCopyToWord} variant="outline">
                <Copy className="w-4 h-4 mr-2" />
                Copiar para Word
              </Button>
              <Button onClick={handleExportToPDF} disabled={isExporting} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                Exportar a PDF
              </Button>
              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white" onClick={onClose}>
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>
          
          <div className="p-6 overflow-y-auto flex-grow bg-white dark:bg-slate-900" id="pliego-content-wrapper">
            <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4 dark:bg-slate-800 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Condiciones y aclaraciones de este pliego</p>
                <Button variant="outline" size="sm" onClick={() => setEditando((v) => !v)}>
                  <Pencil className="w-4 h-4 mr-2" /> {editando ? 'Listo' : 'Editar condiciones'}
                </Button>
              </div>
              {editando && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-slate-500">Una condición por línea. La fecha de preparación se agrega sola al final.</p>
                  <Textarea value={condiciones} onChange={(e) => setCondiciones(e.target.value)} rows={6} className="bg-white text-black" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={guardarPredeterminadas} disabled={guardando}>
                      {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Guardar como predeterminadas
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCondiciones(config?.condiciones_pliego ?? CONDICIONES_PLIEGO)}>
                      <RotateCcw className="w-4 h-4 mr-2" /> Deshacer cambios
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:bg-slate-800 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Ítems extra{extras.length ? ` (${extras.length})` : ''}
                  {estadoExtras && <span className="ml-2 text-xs font-normal text-slate-500">{estadoExtras}</span>}
                </p>
                <Button variant="outline" size="sm" onClick={() => setVerExtras((v) => !v)}>
                  <ListPlus className="w-4 h-4 mr-2" /> {verExtras ? 'Listo' : 'Agregar ítems'}
                </Button>
              </div>
              {verExtras && <div className="mt-3"><ItemsPliego items={extras} onChange={setExtras} /></div>}
            </div>
            <div ref={pliegoRef} className="p-8 bg-white text-black font-sans">
              <header className="flex justify-between items-start pb-8 mb-8 border-b-2 border-gray-200">
                <div className="flex items-center">
                  <div>
                    <h1 className="text-2xl font-bold text-orange-500">{empresa.razon_social}</h1>
                    <p>RUT: {empresa.rut}</p>
                    {empresa.direccion && <p>Dirección: {empresa.direccion}</p>}
                    {empresa.telefono && <p>Tel.: {empresa.telefono}</p>}
                    <p>Email: {empresa.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatDate(new Date())}</p>
                </div>
              </header>

              <section className="mb-8">
                <p className="font-bold">Sres/as: {llamado.organismo}</p>
                <p className="mt-4">
                  Por la presente, dejamos constancia de la presentación de "{shortTitle}".
                </p>
              </section>

              <section className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center"><Package className="w-5 h-5 mr-2 text-orange-500"/>Ítems Solicitados y Presupuesto</h2>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="bg-gray-100">
                                  <th className="p-3 border-b border-gray-200">Ítem</th>
                                  <th className="p-3 border-b border-gray-200 text-center">Cantidad</th>
                                  <th className="p-3 border-b border-gray-200 text-right">P. Unit. s/IVA</th>
                                  <th className="p-3 border-b border-gray-200 text-right">IVA Unit.</th>
                                  <th className="p-3 border-b border-gray-200 text-right">P. Unit. c/IVA</th>
                                  <th className="p-3 border-b border-gray-200 text-right">Total c/IVA</th>
                              </tr>
                          </thead>
                          <tbody>
                              {itemsCalculations.length > 0 ? itemsCalculations.map((item, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                      <td className="p-3 border-b border-gray-200">
                                        {item.imagen ? (
                                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                            <img src={item.imagen} alt="" style={{ width: 90, height: 90, objectFit: 'contain', flexShrink: 0, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }} />
                                            <span>{item.item}</span>
                                          </div>
                                        ) : item.item}
                                      </td>
                                      <td className="p-3 border-b border-gray-200 text-center">{item.cantidad}</td>
                                      <td className="p-3 border-b border-gray-200 text-right">{formatCurrency(item.precioUnitarioSinIva)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right">{formatCurrency(item.ivaUnitario)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right font-semibold">{formatCurrency(item.precioUnitarioConIva)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right font-bold text-green-700">{formatCurrency(item.totalItem)}</td>
                                  </tr>
                              )) : !extrasCalculados.length && (
                                  <tr>
                                      <td colSpan="6" className="text-center p-4 border-b border-gray-200 text-gray-500">No hay ítems presupuestados para este llamado.</td>
                                  </tr>
                              )}
                              {extrasCalculados.map((item) => (
                                  <tr key={item.id}>
                                      <td className="p-3 border-b border-gray-200">
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                          {item.imagen && <img src={item.imagen} alt="" style={{ width: 90, height: 90, objectFit: 'contain', flexShrink: 0, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }} />}
                                          <span>
                                            <span style={{ fontWeight: 600 }}>{item.nombre}</span>
                                            {item.descripcion && <span style={{ display: 'block', fontSize: 13, color: '#4b5563', whiteSpace: 'pre-line', marginTop: 2 }}>{item.descripcion}</span>}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="p-3 border-b border-gray-200 text-center">{item.cantidad}</td>
                                      <td className="p-3 border-b border-gray-200 text-right">{item.sinPrecio ? '' : formatCurrency(item.precioUnitarioSinIva)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right">{item.sinPrecio ? '' : formatCurrency(item.ivaUnitario)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right font-semibold">{item.sinPrecio ? '' : formatCurrency(item.precioUnitarioConIva)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right font-bold text-green-700">{item.sinPrecio ? '' : formatCurrency(item.totalItem)}</td>
                                  </tr>
                              ))}
                          </tbody>
                          <tfoot>
                              <tr className="bg-gray-100 font-bold">
                                  <td colSpan="5" className="p-3 text-right text-lg">Total Presupuestado (IVA inc.)</td>
                                  <td className="p-3 text-right text-lg text-green-600">
                                      {formatCurrency(totalPresupuesto)}
                                  </td>
                              </tr>
                          </tfoot>
                      </table>
                  </div>
              </section>

              <section>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center"><ClipboardCheck className="w-5 h-5 mr-2 text-orange-500"/>Condiciones y Aclaraciones</h2>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 border border-gray-200">
                      {condiciones.split('\n').filter((l) => l.trim()).map((l, i) => <p key={i}>{l}</p>)}
                      <p>Fecha de preparación del documento: {formatDate(new Date())}.</p>
                  </div>
              </section>

              <footer className="mt-16 text-left text-gray-600 text-sm">
                <p>Sin más, les agradecemos y quedamos a las órdenes!!,</p>
                <div className={empresa.firma_imagen ? 'mt-6' : 'mt-16'}>
                  {empresa.firma_imagen && <img src={empresa.firma_imagen} alt="Firma" style={{ maxHeight: 110, maxWidth: 260, objectFit: 'contain' }} />}
                  <div style={{ borderTop: '1px solid #9ca3af', width: 260, marginTop: 4, paddingTop: 4 }} className="text-gray-700">
                    <div className="font-semibold">Guillermo Rosendorff</div>
                    <div>{empresa.razon_social}</div>
                  </div>
                </div>
              </footer>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PliegoModal;