@extends('layouts.app')
@section('title', __('nav.map'))
@section('content')
<div class="flex items-center justify-between mb-3">
    <h1 class="text-xl font-semibold">{{ __('nav.map') }}</h1>
    <div class="flex flex-wrap gap-3 text-xs">
        @foreach(\App\Enums\PlotSaleStatus::cases() as $s)
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded" style="background: {{ $s->color() }}"></span>{{ $s->label() }}</span>
        @endforeach
    </div>
</div>

@if($plots->isEmpty())
    {{-- Map shapes come from the AutoCAD PDF (step 2 of the plan). Until then show the uploaded map, if any. --}}
    <div class="bg-white rounded-lg shadow-sm p-6 text-sm text-slate-600">
        <p>{{ __('plots.map_pending') }}</p>
        @if($project->map_file)
            <a class="text-emerald-700" href="{{ asset('storage/'.$project->map_file) }}" target="_blank">{{ __('plots.open_layout_pdf') }}</a>
        @endif
    </div>
@else
    <div class="bg-white rounded-lg shadow-sm p-2 overflow-auto">
        {{-- Each plot is a polygon; colour = sale status, click opens the plot. --}}
        <svg id="layout" viewBox="{{ $project->map_viewbox ?? '0 0 1000 1400' }}" class="w-full h-auto" style="direction:ltr">
            @foreach($parcels as $p)
                <polygon points="{{ implode(' ', $p->map_shape['points'] ?? []) }}" fill="#d9f99d" stroke="#65a30d" stroke-width="0.5">
                    <title>{{ $p->name }}</title>
                </polygon>
            @endforeach
            @foreach($plots as $plot)
                <a href="{{ route('plots.show', $plot) }}">
                    <polygon points="{{ implode(' ', $plot->map_shape['points'] ?? []) }}" fill="{{ $plot->sale_status->color() }}" fill-opacity="0.75" stroke="#334155" stroke-width="0.4">
                        <title>{{ $plot->plot_no }} – {{ $plot->sale_status->label() }} – {{ $plot->construction_status->label() }}</title>
                    </polygon>
                    @if(isset($plot->map_shape['label']))
                        <text x="{{ $plot->map_shape['label'][0] }}" y="{{ $plot->map_shape['label'][1] }}" font-size="6" text-anchor="middle" pointer-events="none">{{ $plot->plot_no }}</text>
                    @endif
                </a>
            @endforeach
        </svg>
    </div>
@endif
@endsection
