import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import * as XLSX from 'xlsx';

export const useExcelImport = (onComplete) => {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const timerRef = useRef(null);

  const [analysisState, setAnalysisState] = useState({
    analyzing: false,
    message: '',
    error: null,
  });

  useEffect(() => {
    if (importing) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsedTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [importing]);

  const syncDependencies = async (rows) => {
    setCurrentStep('Sincronizando clientes...');
    setImportProgress(25);
    toast({ title: 'Paso 1/4: Sincronizando Clientes...' });
    const clientesToSync = Array.from(new Map(rows.map(row => [row.cuit, { cuit: row.cuit, name: row.clienteNombre || `Cliente ${row.cuit}` }])).values());
    if (clientesToSync.length > 0) {
        const { error: clientesError } = await supabase.from('clientes').upsert(clientesToSync, { onConflict: 'cuit', ignoreDuplicates: false });
        if (clientesError) throw new Error(`Error sincronizando clientes: ${clientesError.message}`);
    }

    setCurrentStep('Sincronizando productos...');
    setImportProgress(40);
    toast({ title: 'Paso 2/4: Sincronizando Productos...' });
    const productosToSync = Array.from(new Map(rows.map(row => [row.codigo, { codigo: row.codigo, nombre: row.productoDesc, moneda: row.moneda, iva: row.iva }])).values());
     if (productosToSync.length > 0) {
        const { error: productosError } = await supabase.from('productos_base').upsert(productosToSync, { onConflict: 'codigo', ignoreDuplicates: false });
        if (productosError) throw new Error(`Error sincronizando productos: ${productosError.message}`);
    }
  };

  const uploadToTempTable = async (rows) => {
    setCurrentStep('Subiendo precios a tabla temporal...');
    setImportProgress(50);
    toast({ title: 'Paso 3/4: Subiendo precios a tabla temporal...' });

    const tempPrices = rows.map(row => ({
      cliente_cuit: row.cuit,
      producto_codigo: row.codigo,
      precio_unitario: row.precioUnitario,
      fecha_ultima_venta: row.fecha,
      iva: row.iva,
      moneda: row.moneda,
    }));
    
    const TEMP_CHUNK_SIZE = 1000;
    for (let i = 0; i < tempPrices.length; i += TEMP_CHUNK_SIZE) {
        const chunk = tempPrices.slice(i, i + TEMP_CHUNK_SIZE);
        const { error } = await supabase.from('temp_precios_import').insert(chunk);
        if (error) {
            console.error("Error subiendo a tabla temporal:", error);
            throw new Error(`Error subiendo precios: ${error.message}`);
        }
        setImportProgress(50 + (i / tempPrices.length) * 25);
    }
  };
  
  const mergePrices = async () => {
    setCurrentStep('Actualizando lista de precios...');
    setImportProgress(75);
    toast({ title: 'Paso 4/4: Actualizando lista de precios...' });
    const { error } = await supabase.rpc('merge_temp_prices');
    if (error) {
      console.error("Error fusionando precios:", error);
      throw new Error(`Error actualizando precios: ${error.message}`);
    }
  };


  const analyzeAndImport = async (json) => {
    setCurrentStep('Analizando archivo con IA...');
    setAnalysisState({ analyzing: true, message: 'Analizando archivo con IA...', error: null });
    try {
        const { data, error } = await supabase.functions.invoke('analyze-excel-import', {
            body: { fileContentJson: json }
        });
        if (error) throw new Error(`Error en el análisis de IA: ${error.message}`);
        if (data.error) throw new Error(`Error del servidor de IA: ${data.error}`);

        setAnalysisState({ analyzing: false, message: '', error: null });
        return data;
    } catch(e) {
        setAnalysisState({ analyzing: false, message: '', error: e.message });
        throw e;
    }
  }

  const fastImport = (json) => {
    setCurrentStep('Procesando filas...');
    return json.map(row => {
      const dateValue = row['Fecha'];
      let isoDate;
      if (typeof dateValue === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const jsDate = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
        isoDate = jsDate.toISOString().split('T')[0];
      } else if (dateValue) {
        try {
          isoDate = new Date(dateValue).toISOString().split('T')[0];
        } catch(e) {
          isoDate = new Date().toISOString().split('T')[0];
        }
      } else {
        isoDate = new Date().toISOString().split('T')[0];
      }

      return {
        fecha: isoDate,
        cuit: String(row['Identificador Contacto'] || '').replace(/[^0-9]/g, ''),
        clienteNombre: row['Contacto'] || '',
        codigo: row['Código'] || '',
        productoDesc: row['Artículo'] || '',
        precioUnitario: parseFloat(String(row['Precio Unitario'] || 0).replace(',', '.')),
        iva: parseInt(row['IVA'] || 22, 10),
        moneda: String(row['Moneda'] || 'UYU').toUpperCase().includes("U") ? "USD" : "UYU",
      }
    });
  }

  const handleImport = async (file, useIA = false) => {
    setImporting(true);
    setImportProgress(0);
    setCurrentStep('Iniciando importación...');
    setElapsedTime(0);

    try {
      setCurrentStep('Leyendo archivo...');
      setImportProgress(5);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);
      setImportProgress(10);
      
      let rowsToProcess;
      if (useIA) {
        rowsToProcess = await analyzeAndImport(json);
      } else {
        rowsToProcess = fastImport(json);
      }
      setImportProgress(20);

      if (!rowsToProcess || rowsToProcess.length === 0) {
        throw new Error("No se encontraron filas válidas para procesar.");
      }

      await syncDependencies(rowsToProcess);
      await uploadToTempTable(rowsToProcess);
      await mergePrices();
      
      setCurrentStep('Completado');
      setImportProgress(100);
      toast({ title: '✅ ¡Importación completada!', description: `${rowsToProcess.length} precios han sido procesados en ${elapsedTime} segundos.` });
      if (onComplete) onComplete();

    } catch (error) {
      console.error("Error durante la importación:", error);
      toast({ variant: 'destructive', title: 'Error de importación', description: error.message });
      setAnalysisState({ analyzing: false, message: '', error: error.message });
      setCurrentStep('Error');
    } finally {
      setImporting(false);
    }
  };

  return { importing, importProgress, analysisState, handleImport, elapsedTime, currentStep };
};