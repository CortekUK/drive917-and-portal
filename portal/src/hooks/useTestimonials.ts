import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Testimonial {
  id: string;
  author: string;
  company_name: string;
  stars: number;
  review: string;
  created_at: string;
  created_by?: string;
  updated_at?: string;
}

export interface AddTestimonialData {
  author: string;
  company_name: string;
  stars: number;
  review: string;
}

export interface UpdateTestimonialData {
  author?: string;
  company_name?: string;
  stars?: number;
  review?: string;
}

export const useTestimonials = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch testimonials
  const { data: testimonials = [], isLoading } = useQuery({
    queryKey: ["testimonials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("testimonials")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Testimonial[];
    },
  });

  // Add testimonial mutation
  const addTestimonialMutation = useMutation({
    mutationFn: async (data: AddTestimonialData) => {
      const { error } = await supabase.from("testimonials").insert({
        author: data.author,
        company_name: data.company_name,
        stars: data.stars,
        review: data.review,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testimonials"] });
      toast({
        title: "Testimonial Added",
        description: "The testimonial has been successfully added.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add testimonial. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update testimonial mutation
  const updateTestimonialMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTestimonialData }) => {
      const { error } = await supabase
        .from("testimonials")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testimonials"] });
      toast({
        title: "Testimonial Updated",
        description: "The testimonial has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update testimonial. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete testimonial mutation
  const deleteTestimonialMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("testimonials")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testimonials"] });
      toast({
        title: "Testimonial Deleted",
        description: "The testimonial has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete testimonial. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    testimonials,
    isLoading,
    addTestimonial: addTestimonialMutation.mutate,
    updateTestimonial: updateTestimonialMutation.mutate,
    deleteTestimonial: deleteTestimonialMutation.mutate,
    isAdding: addTestimonialMutation.isPending,
    isUpdating: updateTestimonialMutation.isPending,
    isDeleting: deleteTestimonialMutation.isPending,
  };
};
