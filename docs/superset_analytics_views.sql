-- Vistas analiticas para Apache Superset.
-- Ejecutar contra la base transaccional con un usuario con permisos DDL.
-- Luego conceder SELECT sobre el schema analytics al usuario de solo lectura de Superset.

create schema if not exists analytics;

drop view if exists analytics.ds_calidad_datos cascade;
drop view if exists analytics.ds_oportunidades_refinanciacion cascade;
drop view if exists analytics.ds_pensionados_360 cascade;
drop view if exists analytics.ds_originacion_mensual cascade;
drop view if exists analytics.ds_creditos_detalle cascade;

create or replace view analytics.ds_creditos_detalle as
with historial_aprobacion as (
    select
        credito_id,
        max(created_at) filter (where estado_nuevo = 'Aprobado') as fecha_aprobacion_historial,
        max(created_at) as fecha_ultimo_cambio_estado
    from historial_creditos
    group by credito_id
),
oportunidades as (
    select
        credito_id,
        max(id) as oportunidad_id,
        max(estado) as estado_oportunidad,
        max(credito_nuevo_id) as credito_nuevo_id
    from oportunidades_refinanciacion
    group by credito_id
)
select
    c.id as credito_id,
    c.pensionado_id,
    upper(trim(concat_ws(' ', p.nombre, p.segundo_nombre, nullif(p.apellidos, 'Sin registrar')))) as pensionado_nombre,
    p.documento as pensionado_documento,
    p.genero,
    p.fecha_nacimiento,
    case
        when p.fecha_nacimiento is null then null
        else extract(year from age(current_date, p.fecha_nacimiento))::int
    end as edad_actual,
    c.asesor_id,
    u.nombre as asesor_nombre,
    u.rol as asesor_rol,
    c.oficina_id,
    o.nombre as oficina_nombre,
    c.cooperativa_id,
    co.nombre as cooperativa_nombre,
    c.pagaduria_id,
    pa.nombre as pagaduria_nombre,
    c.nro_libranza,
    c.tipo_credito,
    c.entidad_financiera_origen,
    c.estado,
    c.situacion_credito,
    c.motivo_finalizacion,
    case
        when c.estado = 'Aprobado' and c.situacion_credito = 'NORMAL' then true
        else false
    end as es_credito_vivo,
    case
        when c.estado = 'Finalizado' or c.situacion_credito = 'CIERRE_VALIDADO' then true
        else false
    end as es_credito_cerrado,
    case
        when c.situacion_credito = 'PENDIENTE_CIERRE' then true
        else false
    end as requiere_validacion_cierre,
    c.monto_solicitado,
    c.monto_aprobado,
    coalesce(c.monto_aprobado, c.monto_solicitado, 0) as monto_referencia,
    case
        when c.monto_solicitado > 0 and c.monto_aprobado is not null
            then round((c.monto_aprobado / c.monto_solicitado) * 100, 2)
        else null
    end as porcentaje_aprobado_vs_solicitado,
    c.plazo,
    c.valor_cuota,
    c.fecha_registro::date as fecha_registro,
    date_trunc('month', c.fecha_registro)::date as mes_registro,
    date_trunc('quarter', c.fecha_registro)::date as trimestre_registro,
    date_trunc('year', c.fecha_registro)::date as anio_registro,
    c.fecha_desembolso,
    c.fecha_fin_estimada,
    coalesce(c.fecha_desembolso, ha.fecha_aprobacion_historial::date, c.fecha_registro::date) as fecha_base_credito,
    ha.fecha_aprobacion_historial,
    ha.fecha_ultimo_cambio_estado,
    case
        when c.fecha_fin_estimada is null then null
        else (c.fecha_fin_estimada - current_date)::int
    end as dias_hasta_fin_estimada,
    case
        when c.fecha_fin_estimada is null then 'sin_fecha_fin'
        when c.fecha_fin_estimada < current_date and c.situacion_credito <> 'CIERRE_VALIDADO' then 'vencido_por_validar'
        when c.fecha_fin_estimada between current_date and current_date + interval '30 days' then 'vence_30_dias'
        when c.fecha_fin_estimada between current_date + interval '31 days' and current_date + interval '90 days' then 'vence_31_90_dias'
        else 'vigente_mayor_90_dias'
    end as tramo_vencimiento_operativo,
    c.tiene_documentos_pendientes,
    c.documentos_pendientes,
    op.oportunidad_id,
    op.estado_oportunidad,
    op.credito_nuevo_id,
    case
        when op.credito_nuevo_id is not null then true
        when op.estado_oportunidad = 'convertido' then true
        else false
    end as oportunidad_convertida,
    c.is_active,
    c.created_at,
    c.updated_at
from creditos c
join pensionados p on p.id = c.pensionado_id
join usuarios u on u.id = c.asesor_id
join oficinas o on o.id = c.oficina_id
join cooperativas co on co.id = c.cooperativa_id
join pagadurias pa on pa.id = c.pagaduria_id
left join historial_aprobacion ha on ha.credito_id = c.id
left join oportunidades op on op.credito_id = c.id
where c.is_active = true;

create or replace view analytics.ds_originacion_mensual as
select
    mes_registro,
    anio_registro,
    oficina_id,
    oficina_nombre,
    asesor_id,
    asesor_nombre,
    cooperativa_id,
    cooperativa_nombre,
    pagaduria_id,
    pagaduria_nombre,
    tipo_credito,
    estado,
    situacion_credito,
    count(*) as creditos,
    count(distinct pensionado_id) as pensionados,
    sum(monto_solicitado) as monto_solicitado,
    sum(coalesce(monto_aprobado, 0)) as monto_aprobado,
    sum(monto_referencia) as monto_referencia,
    avg(nullif(monto_referencia, 0)) as ticket_promedio,
    count(*) filter (where estado = 'Aprobado') as creditos_aprobados,
    count(*) filter (where estado = 'Finalizado') as creditos_finalizados,
    count(*) filter (where estado = 'Prospecto') as creditos_prospecto,
    count(*) filter (where es_credito_vivo) as creditos_vivos,
    count(*) filter (where requiere_validacion_cierre) as creditos_por_validar_cierre
from analytics.ds_creditos_detalle
group by
    mes_registro,
    anio_registro,
    oficina_id,
    oficina_nombre,
    asesor_id,
    asesor_nombre,
    cooperativa_id,
    cooperativa_nombre,
    pagaduria_id,
    pagaduria_nombre,
    tipo_credito,
    estado,
    situacion_credito;

create or replace view analytics.ds_pensionados_360 as
with creditos_pensionado as (
    select
        pensionado_id,
        count(*) as creditos_total,
        count(*) filter (where estado = 'Aprobado') as creditos_aprobados,
        count(*) filter (where estado = 'Finalizado') as creditos_finalizados,
        count(*) filter (where es_credito_vivo) as creditos_vivos,
        count(*) filter (where requiere_validacion_cierre) as creditos_por_validar_cierre,
        sum(monto_referencia) as monto_referencia_total,
        avg(nullif(monto_referencia, 0)) as ticket_promedio,
        max(fecha_registro) as fecha_ultimo_credito,
        max(fecha_fin_estimada) as ultima_fecha_fin_estimada,
        max(cooperativa_nombre) as cooperativa_referencia,
        max(pagaduria_nombre) as pagaduria_referencia
    from analytics.ds_creditos_detalle
    group by pensionado_id
),
oportunidades_pensionado as (
    select
        c.pensionado_id,
        count(*) as oportunidades_total,
        count(*) filter (where opr.estado in ('disponible', 'contactado', 'aceptado')) as oportunidades_activas,
        count(*) filter (where opr.estado = 'convertido' or opr.credito_nuevo_id is not null) as oportunidades_convertidas,
        max(opr.updated_at) as ultima_gestion_oportunidad
    from oportunidades_refinanciacion opr
    join creditos c on c.id = opr.credito_id
    group by c.pensionado_id
)
select
    p.id as pensionado_id,
    upper(trim(concat_ws(' ', p.nombre, p.segundo_nombre, nullif(p.apellidos, 'Sin registrar')))) as pensionado_nombre,
    p.documento,
    p.genero,
    p.fecha_nacimiento,
    case
        when p.fecha_nacimiento is null then null
        else extract(year from age(current_date, p.fecha_nacimiento))::int
    end as edad_actual,
    p.correo,
    p.telefono,
    p.celular,
    p.oficina_id,
    o.nombre as oficina_nombre,
    p.created_by,
    creador.nombre as creado_por_nombre,
    coalesce(cp.creditos_total, 0) as creditos_total,
    coalesce(cp.creditos_aprobados, 0) as creditos_aprobados,
    coalesce(cp.creditos_finalizados, 0) as creditos_finalizados,
    coalesce(cp.creditos_vivos, 0) as creditos_vivos,
    coalesce(cp.creditos_por_validar_cierre, 0) as creditos_por_validar_cierre,
    coalesce(cp.monto_referencia_total, 0) as monto_referencia_total,
    cp.ticket_promedio,
    cp.fecha_ultimo_credito,
    cp.ultima_fecha_fin_estimada,
    cp.cooperativa_referencia,
    cp.pagaduria_referencia,
    coalesce(op.oportunidades_total, 0) as oportunidades_total,
    coalesce(op.oportunidades_activas, 0) as oportunidades_activas,
    coalesce(op.oportunidades_convertidas, 0) as oportunidades_convertidas,
    op.ultima_gestion_oportunidad,
    case
        when coalesce(cp.creditos_vivos, 0) > 0 then 'cliente_con_credito_vivo'
        when coalesce(cp.creditos_finalizados, 0) > 0 then 'cliente_historico_sin_credito_vivo'
        when coalesce(cp.creditos_total, 0) = 0 then 'sin_creditos'
        else 'otro'
    end as segmento_cartera,
    p.is_active,
    p.created_at,
    p.updated_at
from pensionados p
join oficinas o on o.id = p.oficina_id
left join usuarios creador on creador.id = p.created_by
left join creditos_pensionado cp on cp.pensionado_id = p.id
left join oportunidades_pensionado op on op.pensionado_id = p.id
where p.is_active = true;

create or replace view analytics.ds_oportunidades_refinanciacion as
with aprobaciones as (
    select
        credito_id,
        max(created_at)::date as fecha_aprobacion
    from historial_creditos
    where estado_nuevo = 'Aprobado'
    group by credito_id
),
reglas as (
    select
        c.id as credito_id,
        r.tipo_liberacion,
        r.meses_para_refinanciar,
        r.porcentaje_credito,
        case
            when r.tipo_liberacion = 'porcentaje'
                then greatest(1, ceil(c.plazo * coalesce(r.porcentaje_credito, 0) / 100.0))::int
            else coalesce(r.meses_para_refinanciar, 0)
        end as meses_requeridos
    from creditos c
    left join cooperativa_refinanciacion_reglas r
        on r.cooperativa_id = c.cooperativa_id
        and c.plazo between r.plazo_minimo and r.plazo_maximo
),
base as (
    select
        opr.id as oportunidad_id,
        opr.credito_id,
        opr.estado as estado_oportunidad,
        opr.justificacion,
        opr.reactivar_en,
        opr.credito_nuevo_id,
        opr.created_at as oportunidad_creada_en,
        opr.updated_at as oportunidad_actualizada_en,
        c.pensionado_id,
        upper(trim(concat_ws(' ', p.nombre, p.segundo_nombre, nullif(p.apellidos, 'Sin registrar')))) as pensionado_nombre,
        p.documento as pensionado_documento,
        c.oficina_id,
        o.nombre as oficina_nombre,
        coalesce(opr.responsable_id, c.asesor_id) as responsable_id,
        resp.nombre as responsable_nombre,
        c.asesor_id as asesor_credito_id,
        asesor.nombre as asesor_credito_nombre,
        c.cooperativa_id,
        co.nombre as cooperativa_nombre,
        c.pagaduria_id,
        pa.nombre as pagaduria_nombre,
        c.tipo_credito,
        c.estado as estado_credito,
        c.situacion_credito,
        c.monto_aprobado,
        coalesce(c.monto_aprobado, c.monto_solicitado, 0) as monto_referencia,
        c.plazo,
        coalesce(c.fecha_desembolso, ap.fecha_aprobacion, c.fecha_registro::date) as fecha_base_refinanciacion,
        rg.tipo_liberacion,
        rg.meses_para_refinanciar,
        rg.porcentaje_credito,
        rg.meses_requeridos,
        cn.estado as estado_credito_nuevo,
        coalesce(cn.monto_aprobado, cn.monto_solicitado, 0) as monto_credito_nuevo
    from oportunidades_refinanciacion opr
    join creditos c on c.id = opr.credito_id
    join pensionados p on p.id = c.pensionado_id
    join oficinas o on o.id = c.oficina_id
    join usuarios asesor on asesor.id = c.asesor_id
    left join usuarios resp on resp.id = coalesce(opr.responsable_id, c.asesor_id)
    join cooperativas co on co.id = c.cooperativa_id
    join pagadurias pa on pa.id = c.pagaduria_id
    left join aprobaciones ap on ap.credito_id = c.id
    left join reglas rg on rg.credito_id = c.id
    left join creditos cn on cn.id = opr.credito_nuevo_id
    where c.is_active = true and p.is_active = true
)
select
    *,
    (fecha_base_refinanciacion + (coalesce(meses_requeridos, 0)::text || ' months')::interval)::date as disponible_desde,
    greatest(
        0,
        (
            extract(year from age(current_date, fecha_base_refinanciacion))::int * 12
            + extract(month from age(current_date, fecha_base_refinanciacion))::int
        )
    ) as meses_transcurridos,
    case
        when fecha_base_refinanciacion is null then null
        when current_date >= (fecha_base_refinanciacion + (coalesce(meses_requeridos, 0)::text || ' months')::interval)::date then true
        else false
    end as esta_disponible_hoy,
    case
        when estado_oportunidad = 'convertido' or credito_nuevo_id is not null then true
        else false
    end as es_ganada,
    case
        when estado_oportunidad = 'convertido' or credito_nuevo_id is not null then 'ganada'
        when estado_oportunidad in ('disponible', 'contactado', 'aceptado') then 'pipeline_activo'
        when estado_oportunidad = 'pospuesto' then 'pospuesta'
        when estado_oportunidad = 'rechazado' then 'perdida'
        when estado_oportunidad = 'cerrado' then 'cerrada_por_credito_base'
        else 'sin_clasificar'
    end as etapa_bi,
    case
        when credito_nuevo_id is not null then monto_credito_nuevo
        else monto_referencia
    end as monto_impacto_referencia,
    case
        when estado_oportunidad in ('disponible', 'contactado', 'aceptado')
            then (current_date - oportunidad_actualizada_en::date)::int
        else null
    end as dias_sin_actualizacion,
    case
        when estado_oportunidad in ('disponible', 'contactado', 'aceptado')
            and (current_date - oportunidad_actualizada_en::date)::int > 7 then true
        else false
    end as alerta_sin_gestion_7_dias
from base;

create or replace view analytics.ds_calidad_datos as
select
    'creditos' as entidad,
    credito_id as registro_id,
    fecha_registro as fecha_referencia,
    oficina_nombre,
    asesor_nombre as responsable_nombre,
    'monto_aprobado_faltante' as regla_calidad,
    'Credito sin monto aprobado; afecta analisis de monto real aprobado.' as descripcion,
    2 as severidad
from analytics.ds_creditos_detalle
where monto_aprobado is null
union all
select
    'creditos',
    credito_id,
    fecha_registro,
    oficina_nombre,
    asesor_nombre,
    'valor_cuota_faltante',
    'Credito sin valor cuota; impide analisis de recaudo o ingreso mensual esperado.',
    3
from analytics.ds_creditos_detalle
where estado = 'Aprobado' and valor_cuota is null
union all
select
    'creditos',
    credito_id,
    fecha_registro,
    oficina_nombre,
    asesor_nombre,
    'fecha_desembolso_faltante',
    'Credito aprobado sin fecha de desembolso; se usa fecha_registro como fecha de negocio, pero no como desembolso real.',
    2
from analytics.ds_creditos_detalle
where estado = 'Aprobado' and fecha_desembolso is null
union all
select
    'creditos',
    credito_id,
    fecha_registro,
    oficina_nombre,
    asesor_nombre,
    'cierre_pendiente_validacion',
    'Credito marcado como pendiente de cierre; requiere confirmacion manual.',
    2
from analytics.ds_creditos_detalle
where requiere_validacion_cierre = true
union all
select
    'oportunidades_refinanciacion',
    oportunidad_id,
    oportunidad_actualizada_en::date,
    oficina_nombre,
    responsable_nombre,
    'oportunidad_sin_gestion_7_dias',
    'Oportunidad activa sin actualizacion reciente; riesgo de fuga comercial.',
    2
from analytics.ds_oportunidades_refinanciacion
where alerta_sin_gestion_7_dias = true;

grant usage on schema analytics to superset_reader;
grant select on all tables in schema analytics to superset_reader;
