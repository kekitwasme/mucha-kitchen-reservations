'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

interface StaffNoteInputProps {
  reservationId: string;
  currentNotes: string | null;
  onNoteAdded?: () => void;
}

export default function StaffNoteInput({
  reservationId,
  currentNotes,
  onNoteAdded,
}: StaffNoteInputProps) {
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState('');

  const addNoteMutation = useMutation({
    mutationFn: async (newNote: string) => {
      const timestamp = format(new Date(), 'HH:mm');
      const prefix = `[${timestamp} Staff]`;
      const updatedNotes = currentNotes
        ? `${currentNotes}\n${prefix} ${newNote}`
        : `${prefix} ${newNote}`;

      const res = await fetch(`/api/reservations/${reservationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: updatedNotes }),
      });
      if (!res.ok) throw new Error('Failed to add note');
      return res.json();
    },
    onSuccess: () => {
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['reservation', reservationId] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      onNoteAdded?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = noteText.trim();
    if (!trimmed) return;
    addNoteMutation.mutate(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="Add staff note..."
        className="flex-1 text-sm"
        disabled={addNoteMutation.isPending}
      />
      <Button
        type="submit"
        size="sm"
        disabled={!noteText.trim() || addNoteMutation.isPending}
      >
        {addNoteMutation.isPending ? 'Adding…' : 'Add Note'}
      </Button>
    </form>
  );
}