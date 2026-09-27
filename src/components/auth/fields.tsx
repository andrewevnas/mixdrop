import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({
  name,
  label,
  errors,
  ...props
}: { name: string; label: string; errors?: string[] } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={!!errors?.length} {...props} />
      {errors?.map((e) => (
        <p key={e} className="text-destructive text-sm">
          {e}
        </p>
      ))}
    </div>
  );
}

export function RoleFieldset({ errors }: { errors?: string[] }) {
  const options = [
    { value: "client", label: "I'm an artist", hint: "Order mixes and masters" },
    { value: "engineer", label: "I'm an engineer", hint: "Sell mixing and mastering" },
  ];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Account type</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o, i) => (
          <label
            key={o.value}
            className="has-checked:border-primary flex cursor-pointer gap-3 rounded-lg border p-3"
          >
            <input type="radio" name="role" value={o.value} defaultChecked={i === 0} required />
            <span className="grid">
              <span className="text-sm font-medium">{o.label}</span>
              <span className="text-muted-foreground text-xs">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {errors?.map((e) => (
        <p key={e} className="text-destructive text-sm">
          {e}
        </p>
      ))}
    </fieldset>
  );
}

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error) return <p role="alert" className="text-destructive text-sm">{error}</p>;
  if (message) return <p role="status" className="text-sm">{message}</p>;
  return null;
}
