import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Wand2 } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';
import QuickAddItem from './QuickAddItem';
import { useToast } from '@/components/ui/use-toast';


const CreateBudget = ({
  selectedCliente,
  productosCliente,
  plainTextBudget,
  setPlainTextBudget,
  isAnalyzingBudget,
  handleAnalyzeBudget,
  onAddItems,
  onAddManualItem,
  budgetMoneda,
}) => {
  const { toast } = useToast();
  
  const filteredOptions = productosCliente.filter(p => (p.moneda || 'UYU') === budgetMoneda);
  
  const handleAddItemsFiltered = (selectedIds) => {
    const itemsInDifferentCurrency = productosCliente
      .filter(p => selectedIds.includes(p.id) && (p.moneda || 'UYU') !== budgetMoneda);

    if (itemsInDifferentCurrency.length > 0) {
      toast({
        variant: "destructive",
        title: "Conflicto de Moneda",
        description: `No puedes añadir productos con moneda diferente a la del presupuesto.`,
      });
      return;
    }
    onAddItems(selectedIds);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="plain-text-budget">Añadir desde texto (con IA)</Label>
        <div className="flex gap-2">
          <Textarea 
            id="plain-text-budget"
            placeholder="Ej: 10 Sillas de oficina&#10;5 Escritorios 1.20m&#10;20 Lámparas LED"
            value={plainTextBudget}
            onChange={(e) => setPlainTextBudget(e.target.value)}
            disabled={!selectedCliente || isAnalyzingBudget}
            className="flex-grow"
          />
          <Button 
            onClick={handleAnalyzeBudget} 
            disabled={!selectedCliente || !plainTextBudget.trim() || isAnalyzingBudget}
            className=""
            size="icon"
          >
            {isAnalyzingBudget ? <Loader2 className="animate-spin" /> : <Wand2 />}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
        <span className="text-sm text-slate-500">O</span>
        <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
      </div>

      <MultiSelectDropdown 
        options={filteredOptions}
        onAddItems={handleAddItemsFiltered}
        disabled={!selectedCliente}
        budgetMoneda={budgetMoneda}
      />

      <QuickAddItem onAdd={onAddManualItem} disabled={!selectedCliente} moneda={budgetMoneda} />
    </div>
  );
};

export default CreateBudget;