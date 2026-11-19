import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2 } from 'lucide-react';

const AiPromptsManagement = ({ initialPrompts, onDataChange }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [aiPrompts, setAiPrompts] = useState(initialPrompts);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [promptForm, setPromptForm] = useState({ name: '', description: '', prompt_text: '' });

  const handlePromptSelect = (prompt) => {
    setSelectedPrompt(prompt);
    setPromptForm(prompt);
  };
  
  const handlePromptChange = (e) => {
    const { name, value } = e.target;
    setPromptForm(prev => ({...prev, [name]: value }));
  };

  const handleSavePrompt = async () => {
    setLoading(true);
    try {
      const { id, ...updateData } = promptForm;
      const { error } = await supabase.from('ai_prompts').update(updateData).eq('id', id);
      if (error) throw error;
      setAiPrompts(prev => prev.map(p => p.id === id ? promptForm : p));
      toast({ title: '✅ Prompt guardado' });
      onDataChange();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar prompt', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-full">
      <h2 className="text-2xl font-semibold mb-4">Prompts de IA</h2>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/3">
          <h3 className="font-semibold mb-2">Seleccionar Prompt</h3>
          <ul className="space-y-1">
            {aiPrompts.map(p => (
              <li key={p.id}>
                <button onClick={() => handlePromptSelect(p)} className={`w-full text-left p-2 rounded-md ${selectedPrompt?.id === p.id ? 'bg-orange-100 dark:bg-orange-900/50' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full md:w-2/3">
          {selectedPrompt ? (
            <div className="space-y-4">
              <h3 className="font-semibold">{promptForm.name}</h3>
              <Input name="name" label="Nombre del Prompt" value={promptForm.name} onChange={handlePromptChange} />
              <Textarea name="description" label="Descripción" value={promptForm.description} onChange={handlePromptChange} />
              <Textarea name="prompt_text" label="Texto del Prompt" rows={10} value={promptForm.prompt_text} onChange={handlePromptChange} />
              <Button onClick={handleSavePrompt} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                {loading ? 'Guardando...' : 'Guardar Prompt'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              <p>Selecciona un prompt para editar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiPromptsManagement;