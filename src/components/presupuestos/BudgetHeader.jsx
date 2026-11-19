import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, PackagePlus, Building, Sparkles, Download, UploadCloud, Check, ChevronsUpDown } from 'lucide-react';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ClientCombobox = ({ clientes, selectedCliente, onClientChange, disabled }) => {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState(selectedCliente || "")

    React.useEffect(() => {
        setValue(selectedCliente || "");
    }, [selectedCliente]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                    disabled={disabled}
                >
                    {value
                        ? clientes.find((cliente) => cliente.id === value)?.name
                        : "Seleccionar cliente..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                        <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>
                        <CommandGroup>
                            {clientes.map((cliente) => (
                                <CommandItem
                                    key={cliente.id}
                                    value={`${cliente.name} ${cliente.cuit || ''} ${cliente.id}`}
                                    onSelect={() => {
                                        onClientChange(cliente.id)
                                        setValue(cliente.id)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === cliente.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <span className="flex-1">{cliente.name}</span>
                                    {cliente.cuit && <span className="ml-2 text-xs text-slate-400 tabular-nums">RUT {cliente.cuit}</span>}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

const BudgetHeader = ({
  clientes,
  selectedCliente,
  handleClientChange,
  setIsClienteModalOpen,
  setIsProductoModalOpen,
  handleFileChange,
  importing
}) => {
  const handleDownloadTemplate = () => {
    const templateData = [
      ['Fecha', 'Identificador Contacto', 'Contacto', 'Código', 'Artículo', 'Precio Unitario', 'IVA', 'Moneda'],
      ['2024-08-28', '21123456789', 'Cliente de Ejemplo SA', 'PROD-001', 'Producto de Ejemplo', '150.75', '22', 'UYU']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PlantillaPrecios');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-T' });
    saveAs(data, 'plantilla_importacion_precios.xlsx');
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold flex items-center"><Building className="mr-2" /> Clientes</h2>
        <ClientCombobox 
            clientes={clientes}
            selectedCliente={selectedCliente}
            onClientChange={handleClientChange}
            disabled={importing}
        />
        <Button variant="outline" onClick={() => setIsClienteModalOpen(true)} className="w-full">
          <UserPlus className="mr-2 h-4 w-4" />Añadir Nuevo Cliente
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold flex items-center"><PackagePlus className="mr-2" /> Productos Base</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
           <Button variant="outline" onClick={() => setIsProductoModalOpen(true)} className="w-full">
            <PackagePlus className="mr-2 h-4 w-4" />Añadir
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate} className="w-full">
            <Download className="mr-2 h-4 w-4" /> Plantilla
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button asChild variant="outline" className="w-full" disabled={importing}>
                <label className="cursor-pointer flex items-center justify-center gap-2">
                  <Sparkles className="text-purple-500" />
                  <span>Importar con IA</span>
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => handleFileChange(e, true)} className="hidden" disabled={importing} />
                </label>
            </Button>
            <Button asChild variant="outline" className="w-full" disabled={importing}>
                <label className="cursor-pointer flex items-center justify-center gap-2">
                  <UploadCloud className="text-blue-500"/>
                  <span>Importar Rápido</span>
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => handleFileChange(e, false)} className="hidden" disabled={importing} />
                </label>
            </Button>
        </div>
      </div>
    </div>
  );
};

export default BudgetHeader;