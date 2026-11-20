import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const MultiSelectDropdown = ({ options, onAddItems, disabled, budgetMoneda }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const dropdownRef = useRef(null);

  useEffect(() => {
    setSelectedItems(new Set());
  }, [budgetMoneda]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleItem = (itemId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleAddClick = () => {
    onAddItems(Array.from(selectedItems));
    setSelectedItems(new Set());
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button onClick={() => setIsOpen(!isOpen)} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" />
        Añadir productos del cliente
      </Button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-10 mt-2 w-80 rounded-md bg-white dark:bg-slate-900 shadow-lg border dark:border-slate-700"
          >
            <div className="p-2 space-y-1 max-h-[250px] overflow-y-auto">
              {options.length > 0 ? options.map((option) => (
                <Label
                  key={option.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                        id={`checkbox-${option.id}`}
                        checked={selectedItems.has(option.id)}
                        onCheckedChange={() => handleToggleItem(option.id)}
                    />
                    <span>{option.nombre}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {formatCurrency(option.precio_unitario, option.moneda)}
                  </span>
                </Label>
              )) : (
                 <p className="p-2 text-sm text-slate-500">No hay productos en {budgetMoneda} para este cliente.</p>
              )}
            </div>
            {options.length > 0 && (
                <div className="p-2 border-t dark:border-slate-700">
                <Button
                    onClick={handleAddClick}
                    disabled={selectedItems.size === 0}
                    className="w-full"
                >
                    Añadir {selectedItems.size > 0 ? selectedItems.size : ''} Items
                </Button>
                </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MultiSelectDropdown;