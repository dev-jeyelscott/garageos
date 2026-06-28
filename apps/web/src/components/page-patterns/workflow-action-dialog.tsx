'use client';

import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button, Card, cn } from '../ui';

export type WorkflowActionDialogProps = {
  readonly trigger: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly variant?: 'default' | 'destructive';
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onConfirm: () => void | Promise<void>;
  readonly isPending?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
};

type TriggerElementProps = {
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  readonly disabled?: boolean;
  readonly 'aria-haspopup'?: 'dialog';
  readonly 'aria-expanded'?: boolean;
};

export function WorkflowActionDialog({
  trigger,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'default',
  isOpen,
  onOpenChange,
  onConfirm,
  isPending = false,
  disabled = false,
  className,
}: WorkflowActionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isOpen ?? uncontrolledOpen;

  function setOpen(nextOpen: boolean) {
    if (onOpenChange === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  async function handleConfirm() {
    await onConfirm();
  }

  const triggerNode = renderTrigger(trigger, {
    disabled,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    onClick: (event) => {
      if (disabled) {
        return;
      }

      setOpen(true);
      event.currentTarget.focus();
    },
  });

  return (
    <>
      {triggerNode}
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
          role="presentation"
        >
          <Card
            className={cn('w-full max-w-lg rounded-2xl shadow-lg', className)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description === undefined ? undefined : descriptionId}
          >
            <div className="grid gap-5 p-5 sm:p-6">
              <div className="grid gap-2">
                <h2 id={titleId} className="text-lg font-bold text-foreground">
                  {title}
                </h2>
                {description === undefined ? null : (
                  <p id={descriptionId} className="text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>

              {children === undefined ? null : (
                <div className="text-sm text-foreground">{children}</div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  {cancelLabel}
                </Button>
                <Button
                  type="button"
                  variant={variant === 'destructive' ? 'destructive' : 'primary'}
                  onClick={handleConfirm}
                  disabled={disabled || isPending}
                >
                  {isPending ? 'Working...' : confirmLabel}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function renderTrigger(trigger: ReactNode, props: TriggerElementProps) {
  if (isValidElement<TriggerElementProps>(trigger)) {
    const element = trigger as ReactElement<TriggerElementProps>;
    const existingOnClick = element.props.onClick;
    const nextProps: TriggerElementProps = {
      ...props,
      ...(element.props.disabled !== undefined || props.disabled !== undefined
        ? { disabled: element.props.disabled ?? props.disabled ?? false }
        : {}),
      onClick: (event: MouseEvent<HTMLElement>) => {
        existingOnClick?.(event);
        if (!event.defaultPrevented) {
          props.onClick?.(event);
        }
      },
    };

    return cloneElement(element, nextProps);
  }

  return (
    <Button type="button" variant="outline" disabled={props.disabled} onClick={props.onClick}>
      {trigger}
    </Button>
  );
}
