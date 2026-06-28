exports.up = (pgm) => {
  pgm.sql(`
    do $$
    begin
      if to_regclass('public.inventory_ledger_entries') is null then
        raise exception 'inventory_ledger_entries must exist before inventory ledger hardening migration runs';
      end if;
    end;
    $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.inventory_ledger_entries'::regclass
          and conname = 'chk_inventory_ledger_transaction_type'
      ) then
        alter table inventory_ledger_entries
          add constraint chk_inventory_ledger_transaction_type check (
            transaction_type in (
              'purchase_receive',
              'job_order_reservation',
              'reservation_release',
              'job_order_consumption',
              'inventory_adjustment_increase',
              'inventory_adjustment_decrease',
              'inventory_transfer_reservation',
              'inventory_transfer_reservation_release',
              'inventory_transfer_out',
              'inventory_transfer_in',
              'inventory_transfer_variance_loss',
              'supplier_return',
              'refund_inventory_reversal',
              'void_inventory_reversal'
            )
          );
      end if;
    end;
    $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.inventory_ledger_entries'::regclass
          and conname = 'chk_inventory_ledger_nonzero_delta'
      ) then
        alter table inventory_ledger_entries
          add constraint chk_inventory_ledger_nonzero_delta check (
            quantity_delta_on_hand <> 0
            or quantity_delta_reserved <> 0
          );
      end if;
    end;
    $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.inventory_ledger_entries'::regclass
          and conname = 'chk_inventory_ledger_cost_non_negative'
      ) then
        alter table inventory_ledger_entries
          add constraint chk_inventory_ledger_cost_non_negative check (
            (unit_cost is null or unit_cost >= 0)
            and (total_cost is null or total_cost >= 0)
          );
      end if;
    end;
    $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint constraint_definition
        where constraint_definition.conrelid = 'public.inventory_ledger_entries'::regclass
          and constraint_definition.contype = 'f'
          and pg_get_constraintdef(constraint_definition.oid) ilike '%FOREIGN KEY (tenant_id, branch_id)%'
          and pg_get_constraintdef(constraint_definition.oid) ilike '%REFERENCES branches(tenant_id, id)%'
      ) then
        alter table inventory_ledger_entries
          add constraint fk_inventory_ledger_entries_branch
          foreign key (tenant_id, branch_id)
          references branches(tenant_id, id);
      end if;
    end;
    $$;

    create index if not exists idx_inventory_ledger_product_date
      on inventory_ledger_entries(tenant_id, branch_id, product_id, occurred_at desc, id desc);

    create index if not exists idx_inventory_ledger_source
      on inventory_ledger_entries(tenant_id, source_type, source_id);

    create or replace function prevent_inventory_ledger_update_delete()
    returns trigger as $$
    begin
      raise exception 'inventory_ledger_entries is append-only';
    end;
    $$ language plpgsql;

    do $$
    begin
      if not exists (
        select 1
        from pg_trigger trigger_definition
        where trigger_definition.tgrelid = 'public.inventory_ledger_entries'::regclass
          and trigger_definition.tgname = 'trg_inventory_ledger_entries_append_only'
          and not trigger_definition.tgisinternal
      ) then
        create trigger trg_inventory_ledger_entries_append_only
          before update or delete on inventory_ledger_entries
          for each row
          execute function prevent_inventory_ledger_update_delete();
      end if;
    end;
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop trigger if exists trg_inventory_ledger_entries_append_only on inventory_ledger_entries;

    drop index if exists idx_inventory_ledger_product_date;
    drop index if exists idx_inventory_ledger_source;

    alter table inventory_ledger_entries
      drop constraint if exists fk_inventory_ledger_entries_branch;

    alter table inventory_ledger_entries
      drop constraint if exists chk_inventory_ledger_cost_non_negative;

    alter table inventory_ledger_entries
      drop constraint if exists chk_inventory_ledger_nonzero_delta;

    alter table inventory_ledger_entries
      drop constraint if exists chk_inventory_ledger_transaction_type;

    drop function if exists prevent_inventory_ledger_update_delete();
  `);
};
