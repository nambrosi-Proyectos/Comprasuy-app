import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

const BudgetItemList = ({
  items,
  handleItemChange,
  handleRemoveItem,
  moneda,
}) => {
  return (
    <div className="space-y-3">
        <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-sm font-medium text-slate-500 sticky top-0 bg-white dark:bg-slate-800/50 py-2 z-10">
            <div className="col-span-5">Producto</div>
            <div className="col-span-2">Cantidad</div>
            <div className="col-span-2">P. Unitario ({moneda})</div>
            <div className="col-span-2">IVA (%)</div>
            <div className="col-span-1"></div>
        </div>
      {items.map(item => (
        <motion.div 
            key={item.id} 
            layout 
            className={cn(
                "grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 rounded-lg transition-colors",
                item.precio_manual ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-slate-50 dark:bg-slate-800'
            )}
        >
          <div className="md:col-span-5 space-y-1">
            <Label className="md:hidden">Producto</Label>
            <Input readOnly value={item.nombre} className="bg-transparent border-0 font-medium" />
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label className="md:hidden">Cantidad</Label>
            <Input type="number" value={item.cantidad} onChange={e => handleItemChange(item.id, 'cantidad', e.target.value)} placeholder="1" />
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label className="md:hidden">Precio Unit. ({moneda})</Label>
            <Input type="number" value={item.precio_unitario} onChange={e => handleItemChange(item.id, 'precio_unitario', e.target.value)} placeholder="0.00"/>
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label className="md:hidden">IVA (%)</Label>
            <Select onValueChange={val => handleItemChange(item.id, 'iva', val)} value={String(item.iva)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="22">22%</SelectItem>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="0">0%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1 flex justify-end">
            <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
              <Trash2 className="h-5 w-5 text-red-500" />
            </Button>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default BudgetItemList;