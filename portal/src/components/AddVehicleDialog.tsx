import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Car, PoundSterling, CalendarIcon, ShieldCheck, KeyRound, Cog, Upload, X, Camera } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FormDescription } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const vehicleSchema = z.object({
  reg: z.string().min(1, "Registration number is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.number().min(1900, "Year must be after 1900").max(new Date().getFullYear() + 1, "Year cannot be in the future").optional(),
  colour: z.string().min(1, "Color is required"),
  purchase_price: z.number().min(0, "Price must be positive").optional(),
  contract_total: z.number().min(0, "Contract total must be positive").optional(),
  daily_rent: z.number({ required_error: "Daily rent is required", invalid_type_error: "Daily rent must be a number" }).min(0, "Daily rent must be positive"),
  weekly_rent: z.number({ required_error: "Weekly rent is required", invalid_type_error: "Weekly rent must be a number" }).min(0, "Weekly rent must be positive"),
  monthly_rent: z.number({ required_error: "Monthly rent is required", invalid_type_error: "Monthly rent must be a number" }).min(0, "Monthly rent must be positive"),
  acquisition_date: z.date(),
  acquisition_type: z.enum(['Purchase', 'Finance']),
  // MOT & TAX fields
  mot_due_date: z.date().optional(),
  tax_due_date: z.date().optional(),
  // Warranty fields
  warranty_start_date: z.date().optional(),
  warranty_end_date: z.date().optional(),
  // Logbook field
  has_logbook: z.boolean().default(false),
  // Service plan and spare key fields
  has_service_plan: z.boolean().default(false),
  has_spare_key: z.boolean().default(false),
  spare_key_holder: z.enum(["Company", "Customer"]).optional(),
  spare_key_notes: z.string().optional(),
  // Security fields
  has_tracker: z.boolean().default(false),
  has_remote_immobiliser: z.boolean().default(false),
  security_notes: z.string().optional(),
  // Photo upload
  photo_file: z.instanceof(File).optional(),
}).refine(
  (data) => {
    if (data.acquisition_type === 'Finance' && !data.contract_total) {
      return false;
    }
    if (data.acquisition_type === 'Purchase' && !data.purchase_price) {
      return false;
    }
    return true;
  },
  {
    message: "Contract total is required for financed vehicles",
    path: ["contract_total"],
  }
).refine((data) => {
  if (data.has_spare_key) {
    return data.spare_key_holder !== undefined;
  }
  return true;
}, {
  message: "Spare key holder is required when spare key exists",
  path: ["spare_key_holder"],
})

type VehicleFormData = z.infer<typeof vehicleSchema>;

interface AddVehicleDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const AddVehicleDialog = ({ open, onOpenChange }: AddVehicleDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      reg: "",
      make: "",
      model: "",
      year: undefined,
      colour: "",
      acquisition_date: new Date(),
      acquisition_type: "Purchase",
      has_logbook: false,
      has_service_plan: false,
      has_spare_key: false,
      spare_key_holder: undefined,
      spare_key_notes: "",
      has_tracker: false,
      has_remote_immobiliser: false,
      security_notes: "",
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setIsOpen(newOpen);
    }
  };

  const currentOpen = open !== undefined ? open : isOpen;

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image file (JPG, PNG, WebP, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setPhotoFile(file);

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onSubmit = async (data: VehicleFormData) => {
    setLoading(true);

    try {
      // Normalize registration
      const normalizedReg = data.reg.toUpperCase().trim();

      const vehicleData: any = {
        reg: normalizedReg,
        make: data.make,
        model: data.model,
        year: data.year,
        colour: data.colour,
        acquisition_type: data.acquisition_type,
        acquisition_date: data.acquisition_date.toISOString().split('T')[0],
        daily_rent: data.daily_rent,
        weekly_rent: data.weekly_rent,
        monthly_rent: data.monthly_rent,
        mot_due_date: data.mot_due_date?.toISOString().split('T')[0],
        tax_due_date: data.tax_due_date?.toISOString().split('T')[0],
        warranty_start_date: data.warranty_start_date?.toISOString().split('T')[0],
        warranty_end_date: data.warranty_end_date?.toISOString().split('T')[0],
        has_logbook: data.has_logbook,
        has_service_plan: data.has_service_plan,
        has_spare_key: data.has_spare_key,
        spare_key_holder: data.has_spare_key ? data.spare_key_holder : null,
        spare_key_notes: data.has_spare_key ? data.spare_key_notes : null,
        has_tracker: data.has_tracker,
        has_remote_immobiliser: data.has_remote_immobiliser,
        security_notes: data.security_notes || null,
      };

      // Add type-specific fields
      if (data.acquisition_type === 'Purchase') {
        vehicleData.purchase_price = data.purchase_price;
      } else if (data.acquisition_type === 'Finance') {
        // For finance vehicles, convert contract total to the structure expected by triggers
        vehicleData.initial_payment = data.contract_total;
        vehicleData.monthly_payment = 1; // Dummy value to satisfy constraints
        vehicleData.term_months = 1; // Dummy value
      }

      // Insert vehicle first
      const { data: insertedVehicle, error } = await supabase
        .from("vehicles")
        .insert(vehicleData)
        .select()
        .single();

      if (error) throw error;

      // Upload photo if one was selected
      if (photoFile && insertedVehicle) {
        try {
          const fileExt = photoFile.name.split('.').pop();
          const fileName = `${insertedVehicle.id}-${Date.now()}.${fileExt}`;
          const filePath = `${fileName}`;

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('vehicle-photos')
            .upload(filePath, photoFile);

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('vehicle-photos')
            .getPublicUrl(filePath);

          // Update vehicle record with photo URL
          const { error: updateError } = await supabase
            .from('vehicles')
            .update({ photo_url: publicUrl })
            .eq('id', insertedVehicle.id);

          if (updateError) throw updateError;
        } catch (photoError: any) {
          console.error('Photo upload error:', photoError);
          toast({
            title: "Photo Upload Warning",
            description: "Vehicle added but photo upload failed. You can upload it later from the vehicle details page.",
            variant: "default",
          });
        }
      }

      toast({
        title: "Vehicle Added",
        description: `${data.make} ${data.model} (${normalizedReg}) has been added to the fleet.`,
      });

      form.reset();
      handleRemovePhoto();
      handleOpenChange(false);

      // Refresh the vehicles list and P&L data
      queryClient.invalidateQueries({ queryKey: ["vehicles-list"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles-pl"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-count"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-pl-entries"] });
    } catch (error: any) {
      let errorMessage = "Failed to add vehicle. Please try again.";

      // Check for unique constraint violation on registration number
      if (error?.code === '23505' && error?.details?.includes('vehicles_reg_key')) {
        errorMessage = `A vehicle with registration '${data.reg}' already exists. Please use a different registration number.`;
      } else if (error?.code === '23505') {
        errorMessage = "This vehicle registration number is already in use. Please check and try again.";
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={currentOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-primary text-primary-foreground hover:opacity-90 transition-all duration-200 rounded-lg focus:ring-2 focus:ring-primary">
          <Plus className="mr-2 h-4 w-4" />
          Add Vehicle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            Add New Vehicle
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <ScrollArea className="h-[60vh] px-8">
              <div className="space-y-4 pr-6 py-2">
                <div className="grid grid-cols-2 gap-4 ml-3">
                  <FormField
                    control={form.control}
                    name="reg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>License Plate Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. AB12 CDE" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="acquisition_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Acquisition Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 ml-3">
                  <FormField
                    control={form.control}
                    name="make"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Make *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Ford" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Transit" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g. 2020" 
                            {...field} 
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : "")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 ml-3">
                  <FormField
                    control={form.control}
                    name="colour"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. White" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="purchase_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Price ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Enter amount"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : "")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 ml-3">
                  <FormField
                    control={form.control}
                    name="daily_rent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Daily Rent ($) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Daily rate"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === "" ? undefined : parseFloat(value));
                            }}
                            onKeyPress={(e) => {
                              // Only allow numbers, one decimal point, and control keys
                              if (!/[\d.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                                e.preventDefault();
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="weekly_rent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weekly Rent ($) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Weekly rate"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === "" ? undefined : parseFloat(value));
                            }}
                            onKeyPress={(e) => {
                              // Only allow numbers, one decimal point, and control keys
                              if (!/[\d.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                                e.preventDefault();
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="monthly_rent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Rent ($) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Monthly rate"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === "" ? undefined : parseFloat(value));
                            }}
                            onKeyPress={(e) => {
                              // Only allow numbers, one decimal point, and control keys
                              if (!/[\d.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                                e.preventDefault();
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 ml-3">
                  <FormField
                    control={form.control}
                    name="mot_due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspection Due Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick MOT due date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date("1900-01-01")}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="tax_due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Due Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick TAX due date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date("1900-01-01")}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 ml-3">
                  <FormField
                    control={form.control}
                    name="warranty_start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warranty Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick warranty start date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date("1900-01-01")}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="warranty_end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warranty End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick warranty end date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date("1900-01-01")}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="ml-3">
                  <FormField
                    control={form.control}
                    name="acquisition_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Acquisition Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select acquisition type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Purchase">Purchase</SelectItem>
                            <SelectItem value="Finance">Finance</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Contract Total field - only show for Finance */}
                {form.watch("acquisition_type") === "Finance" && (
                  <div className="ml-3">
                    <FormField
                      control={form.control}
                      name="contract_total"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contract Total ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Enter contract total"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : "")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Vehicle Photo Upload Section */}
                <div className="space-y-4 ml-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    Vehicle Photo (Optional)
                  </h3>

                  <div className="flex justify-center">
                    <div className="relative w-64 h-48 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/20 overflow-hidden">
                      {photoPreview ? (
                        <>
                          <img
                            src={photoPreview}
                            alt="Vehicle preview"
                            className="w-full h-full object-cover"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={handleRemovePhoto}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <Car className="h-12 w-12 mb-2 opacity-30" />
                          <p className="text-xs font-medium">No photo selected</p>
                          <p className="text-xs opacity-75">Upload a photo of the vehicle</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Upload className="h-3 w-3" />
                      {photoPreview ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />

                  {/* Upload instructions */}
                  <div className="text-xs text-muted-foreground/75 text-center">
                    <p>JPG, PNG, WebP • Max 5MB</p>
                  </div>
                </div>

                {/* Compliance Section */}
                <div className="space-y-4 ml-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Compliance
                  </h3>
                  
                  <FormField
                    control={form.control}
                    name="has_logbook"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Has Logbook</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Vehicle has a physical logbook
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="has_service_plan"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Has Service Plan</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Vehicle has an active service plan
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="has_spare_key"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Has Spare Key</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Vehicle has a spare key available
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Spare Key Holder - only show if has_spare_key is true */}
                  {form.watch("has_spare_key") && (
                    <div className="ml-3">
                      <FormField
                        control={form.control}
                        name="spare_key_holder"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Spare Key Holder</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select who holds the spare key" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Company">Company</SelectItem>
                                <SelectItem value="Customer">Customer</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Spare Key Notes - only show if has_spare_key is true */}
                  {form.watch("has_spare_key") && (
                    <div className="ml-3">
                      <FormField
                        control={form.control}
                        name="spare_key_notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Spare Key Notes</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Additional notes about spare key location or details..."
                                className="resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                {/* Security Section */}
                <div className="space-y-4 ml-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-primary" />
                    Security Features
                  </h3>

                  <FormField
                    control={form.control}
                    name="has_tracker"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Has Tracker</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Vehicle has a GPS tracker installed
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="has_remote_immobiliser"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Has Remote Immobilizer</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Vehicle has a remote immobilizer system
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="security_notes"
                    render={({ field }) => (
                        <FormItem>
                          <FormLabel>Security Notes</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Additional security information..."
                              className="resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                     />
                </div>
              </div>
            </ScrollArea>
            
            <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading} 
                className="bg-gradient-primary rounded-lg transition-all duration-200 focus:ring-2 focus:ring-primary"
              >
                {loading ? "Adding..." : "Add Vehicle"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};