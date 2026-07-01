import type { ChangeEvent, FormEvent } from 'react';

import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../../../components/ui';
import type { ApiClientError } from '../../../lib/api-envelope';

import type { SupplierFormValues } from '../supplier.types';
import { getFieldErrorMap } from '../supplier.ui';

interface SupplierFormProps {
  readonly mode: 'create' | 'edit';
  readonly values: SupplierFormValues;
  readonly disabled: boolean;
  readonly submitting: boolean;
  readonly apiError: ApiClientError | null;
  readonly clientError: string | null;
  readonly successMessage: string | null;
  readonly supplierId: string | undefined;
  readonly blockReason: string | null;
  readonly onChange: (values: SupplierFormValues) => void;
  readonly onSubmit: () => void;
}

export function SupplierForm({
  mode,
  values,
  disabled,
  submitting,
  apiError,
  clientError,
  successMessage,
  supplierId,
  blockReason,
  onChange,
  onSubmit,
}: SupplierFormProps) {
  const fieldErrors = getFieldErrorMap(apiError);
  const title = mode === 'create' ? 'New supplier' : 'Edit supplier';
  const description =
    mode === 'create'
      ? 'Create a tenant-wide supplier record for purchasing workflows.'
      : 'Update supplier contact information with optimistic locking preserved by the API.';

  function handleChange(field: keyof SupplierFormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({
        ...values,
        [field]: event.currentTarget.value,
      });
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Purchasing and suppliers
            </p>
            <CardTitle className="mt-2 text-2xl">{title}</CardTitle>
            <CardDescription className="mt-2">{description}</CardDescription>
            {supplierId === undefined ? null : (
              <p className="mt-2 break-all text-xs text-muted-foreground">
                Supplier ID: <span className="font-mono">{supplierId}</span>
              </p>
            )}
          </div>
          <ButtonLink href="/suppliers" variant="secondary">
            Back to suppliers
          </ButtonLink>
        </CardHeader>
      </Card>

      {blockReason === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Supplier write blocked</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{blockReason}</p>
        </Alert>
      )}

      {clientError === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Check the supplier form</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{clientError}</p>
        </Alert>
      )}

      {apiError === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">{apiError.message}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Error code: {apiError.code}
          </p>
          {apiError.requestId === null && apiError.correlationId === null ? null : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reference:{' '}
              {[apiError.requestId, apiError.correlationId]
                .filter((value): value is string => value !== null)
                .join(' · ')}
            </p>
          )}
        </Alert>
      )}

      {successMessage === null ? null : (
        <Alert variant="success">
          <p className="text-sm font-bold">{successMessage}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The supplier list will show the latest server state after refresh.
          </p>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Supplier information</CardTitle>
          <CardDescription>
            Supplier name is required. Contact person, mobile number, email, address, and notes are
            optional documented supplier fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SupplierInput
            id="supplier-name"
            label="Supplier name"
            value={values.name}
            disabled={disabled || submitting}
            required
            fieldError={fieldErrors.get('name') ?? null}
            onChange={handleChange('name')}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <SupplierInput
              id="supplier-contact-person"
              label="Contact person"
              value={values.contact_person}
              disabled={disabled || submitting}
              fieldError={fieldErrors.get('contact_person') ?? null}
              onChange={handleChange('contact_person')}
            />
            <SupplierInput
              id="supplier-mobile-number"
              label="Mobile number"
              value={values.mobile_number}
              disabled={disabled || submitting}
              fieldError={fieldErrors.get('mobile_number') ?? null}
              onChange={handleChange('mobile_number')}
            />
          </div>

          <SupplierInput
            id="supplier-email"
            label="Email"
            type="email"
            value={values.email}
            disabled={disabled || submitting}
            fieldError={fieldErrors.get('email') ?? null}
            onChange={handleChange('email')}
          />

          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Address</span>
            <textarea
              id="supplier-address"
              value={values.address}
              disabled={disabled || submitting}
              onChange={handleChange('address')}
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {fieldErrors.get('address') === undefined ? null : (
              <span className="text-sm text-destructive">{fieldErrors.get('address')}</span>
            )}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Notes</span>
            <textarea
              id="supplier-notes"
              value={values.notes}
              disabled={disabled || submitting}
              onChange={handleChange('notes')}
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {fieldErrors.get('notes') === undefined ? null : (
              <span className="text-sm text-destructive">{fieldErrors.get('notes')}</span>
            )}
          </label>
        </CardContent>
      </Card>

      <Card className="sticky bottom-20 z-10 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-end md:bottom-4">
        <ButtonLink href="/suppliers" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={disabled || submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create supplier' : 'Save supplier'}
        </Button>
      </Card>
    </form>
  );
}

function SupplierInput({
  id,
  label,
  type = 'text',
  value,
  disabled,
  required = false,
  fieldError,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly type?: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly fieldError: string | null;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="text-sm font-bold text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        required={required}
        onChange={onChange}
      />
      {fieldError === null ? null : <span className="text-sm text-destructive">{fieldError}</span>}
    </label>
  );
}
