import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const BudgetTotals = ({ totals, handleSavePresupuesto, saving, moneda }) => {
  return (
    <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="grid grid-cols-3 gap-4 text-center w-full sm:w-auto">
        <div>
          <p className="text-sm text-slate-500">Subtotal</p>
          <p className="font-semibold">{formatCurrency(totals.subtotal, moneda)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">IVA</p>
          <p className="font-semibold">{formatCurrency(totals.iva, moneda)}</p>
        </div>
        <div>
          <p className="text-sm font-bold">Total</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totals.total, moneda)}</p>
        </div>
      </div>
      <Button onClick={handleSavePresupuesto} disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Guardar Presupuesto
      </Button>
    </div>
  );
};

export default BudgetTotals;