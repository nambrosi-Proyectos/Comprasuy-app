import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Copy, FileDown, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const BudgetPreviewModal = ({ isOpen, onClose, presupuesto, cliente, config }) => {
  const { toast } = useToast();
  const pdfRef = useRef();
  const [isGenerating, setIsGenerating] = React.useState(false);

  if (!isOpen || !presupuesto || !cliente) return null;

  const moneda = presupuesto.moneda || 'UYU';

  const handleCopy = () => {
    let textToCopy = `Presupuesto para: ${cliente.name}\n`;
    textToCopy += `Fecha: ${formatDate(new Date())}\n\n`;
    textToCopy += '--- DETALLE ---\n';

    presupuesto.items.forEach(item => {
      const totalItem = (item.cantidad * item.precio_unitario) * (1 + (item.iva / 100));
      textToCopy += `- ${item.nombre} (x${item.cantidad}): ${formatCurrency(totalItem, moneda)} (IVA Inc.)\n`;
    });

    textToCopy += '\n--- TOTALES ---\n';
    textToCopy += `Subtotal: ${formatCurrency(presupuesto.subtotal, moneda)}\n`;
    textToCopy += `IVA: ${formatCurrency(presupuesto.iva, moneda)}\n`;
    textToCopy += `TOTAL: ${formatCurrency(presupuesto.total, moneda)}`;

    navigator.clipboard.writeText(textToCopy);
    toast({ title: '✅ Copiado', description: 'El presupuesto ha sido copiado al portapapeles.' });
  };

  const handleExportPDF = async () => {
    setIsGenerating(true);
    toast({ title: '📄 Generando PDF...', description: 'Por favor espera un momento.' });
    const input = pdfRef.current;
    try {
      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`presupuesto-${cliente.name.replace(/\s/g, '_')}-${presupuesto.id.substring(0, 8)}.pdf`);
    } catch (error) {
        console.error("Error al generar PDF:", error)
        toast({ variant: 'destructive', title: 'Error al generar PDF', description: error.message });
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl">Vista Previa del Presupuesto</DialogTitle>
          </DialogHeader>
          
          <div className="p-6 max-h-[70vh] overflow-y-auto">
             <div ref={pdfRef} className="p-8 bg-white text-black">
                <header className="flex justify-between items-start pb-6 border-b">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{config?.razon_social || 'Mi Empresa'}</h1>
                        <p className="text-sm text-gray-500">{config?.direccion || 'Dirección de la empresa'}</p>
                        <p className="text-sm text-gray-500">{config?.email || 'email@empresa.com'} | {config?.telefono || 'Teléfono'}</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-semibold text-gray-700">PRESUPUESTO ({moneda})</h2>
                        <p className="text-sm text-gray-500"># {presupuesto.id.substring(0, 8)}</p>
                        <p className="text-sm text-gray-500">Fecha: {formatDate(presupuesto.created_at)}</p>
                    </div>
                </header>

                <section className="mt-8">
                    <h3 className="font-semibold text-gray-700">Cliente:</h3>
                    <p className="text-gray-600">{cliente.name}</p>
                    {cliente.cuit && <p className="text-sm text-gray-500">RUT/CI: {cliente.cuit}</p>}
                </section>
                
                <section className="mt-8">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="p-3 font-semibold">Producto</th>
                                <th className="p-3 font-semibold text-right">Cantidad</th>
                                <th className="p-3 font-semibold text-right">P. Unitario</th>
                                <th className="p-3 font-semibold text-right">IVA (%)</th>
                                <th className="p-3 font-semibold text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {presupuesto.items.map((item, index) => {
                                const totalItem = (item.cantidad * item.precio_unitario) * (1 + (item.iva / 100));
                                return (
                                    <tr key={index} className="border-b">
                                        <td className="p-3">{item.nombre}</td>
                                        <td className="p-3 text-right">{item.cantidad}</td>
                                        <td className="p-3 text-right">{formatCurrency(item.precio_unitario, moneda)}</td>
                                        <td className="p-3 text-right">{item.iva}%</td>
                                        <td className="p-3 text-right font-medium">{formatCurrency(totalItem, moneda)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>

                <section className="mt-8 flex justify-end">
                    <div className="w-full max-w-xs space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-600">Subtotal:</span>
                            <span className="font-medium">{formatCurrency(presupuesto.subtotal, moneda)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">IVA:</span>
                            <span className="font-medium">{formatCurrency(presupuesto.iva, moneda)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2 mt-2">
                            <span className="text-xl font-bold text-gray-800">TOTAL:</span>
                            <span className="text-xl font-bold text-gray-800">{formatCurrency(presupuesto.total, moneda)}</span>
                        </div>
                    </div>
                </section>
                {config?.footer_texto && (
                    <footer className="mt-12 pt-6 border-t text-center text-xs text-gray-500">
                        <p>{config.footer_texto}</p>
                    </footer>
                )}
             </div>
          </div>
          
          <DialogFooter className="p-6 pt-0 flex-row justify-end space-x-2">
            <Button variant="outline" onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" /> Copiar
            </Button>
            <Button onClick={handleExportPDF} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Exportar a PDF
            </Button>
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};