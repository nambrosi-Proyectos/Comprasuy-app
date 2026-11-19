import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileDown, Loader2, Package, ClipboardCheck, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { htmlToText } from 'html-to-text';
import { supabase } from '@/lib/customSupabaseClient';

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
  const [empresa, setEmpresa] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    supabase.from('pliego_config').select('*').limit(1).maybeSingle().then(({ data, error }) => {
      if (error) console.warn('No se pudieron cargar los datos de la empresa:', error.message);
      setEmpresa(data || {});
    });
  }, [isOpen]);

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

  const totalPresupuesto = itemsCalculations.reduce((sum, item) => sum + item.totalItem, 0);

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
            <div ref={pliegoRef} className="p-8 bg-white text-black font-sans">
              <header className="flex justify-between items-start pb-8 mb-8 border-b-2 border-gray-200">
                <div className="flex items-center">
                  <div>
                    <h1 className="text-2xl font-bold text-orange-500">{empresa?.razon_social || 'Compras.uy'}</h1>
                    <p>RUT: {empresa?.rut || '215276350015'}</p>
                    <p>Email: {empresa?.email || 'Compras@comprasuy.com'}</p>
                    {empresa?.telefono && <p>Tel.: {empresa.telefono}</p>}
                    {empresa?.direccion && <p>{empresa.direccion}</p>}
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
                                      <td className="p-3 border-b border-gray-200">{item.item}</td>
                                      <td className="p-3 border-b border-gray-200 text-center">{item.cantidad}</td>
                                      <td className="p-3 border-b border-gray-200 text-right">{formatCurrency(item.precioUnitarioSinIva)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right">{formatCurrency(item.ivaUnitario)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right font-semibold">{formatCurrency(item.precioUnitarioConIva)}</td>
                                      <td className="p-3 border-b border-gray-200 text-right font-bold text-green-700">{formatCurrency(item.totalItem)}</td>
                                  </tr>
                              )) : (
                                  <tr>
                                      <td colSpan="6" className="text-center p-4 border-b border-gray-200 text-gray-500">No hay ítems presupuestados para este llamado.</td>
                                  </tr>
                              )}
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
                      <p>Los precios cotizados es por todo concepto definido en el pliego.</p>
                      <p>La presente oferta tiene el plazo de entrega definido en el pliego.</p>
                      <p>El pago se realizará por siff segun pliego de condiciones.</p>
                      <p>Fecha de preparación del documento: {formatDate(new Date())}.</p>
                  </div>
              </section>

              <footer className="mt-16 text-left text-gray-600 text-sm">
                <p>Sin más, les agradecemos y quedamos a las órdenes!!,</p>
                {empresa?.firma_imagen && (
                  <div className="mt-6">
                    <img src={empresa.firma_imagen} alt="Firma" style={{ maxHeight: 110, maxWidth: 260, objectFit: 'contain' }} />
                    <div style={{ borderTop: '1px solid #9ca3af', width: 260, marginTop: 4, paddingTop: 4 }} className="text-gray-700">
                      {empresa.razon_social || 'Compras.uy'}
                    </div>
                  </div>
                )}
              </footer>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PliegoModal;