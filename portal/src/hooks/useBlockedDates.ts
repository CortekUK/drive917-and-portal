import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export interface BlockedDate {
  id: string;
  start_date: string;
  end_date: string;
  reason?: string;
  created_at: string;
  created_by?: string;
}

export interface AddBlockedDateData {
  start_date: Date;
  end_date: Date;
  reason?: string;
}

export const useBlockedDates = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch blocked dates
  const { data: blockedDates = [], isLoading } = useQuery({
    queryKey: ["blocked-dates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_dates")
        .select("*")
        .order("start_date", { ascending: true });

      if (error) throw error;
      return data as BlockedDate[];
    },
  });

  // Add blocked date mutation
  const addBlockedDateMutation = useMutation({
    mutationFn: async (data: AddBlockedDateData) => {
      const { error } = await supabase.from("blocked_dates").insert({
        start_date: format(data.start_date, 'yyyy-MM-dd'),
        end_date: format(data.end_date, 'yyyy-MM-dd'),
        reason: data.reason,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-dates"] });
      toast({
        title: "Date Range Blocked",
        description: "The date range has been successfully blocked.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to block date range. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete blocked date mutation
  const deleteBlockedDateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blocked_dates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-dates"] });
      toast({
        title: "Date Range Unblocked",
        description: "The date range has been successfully unblocked.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unblock date range. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    blockedDates,
    isLoading,
    addBlockedDate: addBlockedDateMutation.mutate,
    deleteBlockedDate: deleteBlockedDateMutation.mutate,
    isAdding: addBlockedDateMutation.isPending,
    isDeleting: deleteBlockedDateMutation.isPending,
  };
};
