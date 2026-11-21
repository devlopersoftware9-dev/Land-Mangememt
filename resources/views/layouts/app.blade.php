@php($rtl = app()->getLocale() === 'ur')
<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}" dir="{{ $rtl ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', __('app.name')) · {{ $currentProject->code ?? '' }}</title>
    {{-- Scaffold stage: Tailwind from CDN. Before going live switch to Vite build (npm run build). --}}
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: {{ $rtl ? "'Noto Nastaliq Urdu', serif" : "'Inter', sans-serif" }}; }
        [dir=rtl] body { line-height: 2.1; }
        .ltr-num { direction: ltr; unicode-bidi: embed; font-family: 'Inter', sans-serif; }
    </style>
    @stack('head')
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen">
@auth
<header class="bg-white border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
        <a href="{{ route('dashboard') }}" class="font-semibold">{{ __('app.name') }}</a>
        <nav class="flex gap-4 text-sm">
            <a href="{{ route('dashboard') }}" class="hover:text-emerald-700">{{ __('nav.dashboard') }}</a>
            <a href="{{ route('plots.index') }}" class="hover:text-emerald-700">{{ __('nav.plots') }}</a>
            <a href="{{ route('plots.map') }}" class="hover:text-emerald-700">{{ __('nav.map') }}</a>
            <a href="{{ route('registry.index') }}" class="hover:text-emerald-700">{{ __('nav.registry') }}</a>
            <a href="{{ route('approvals.index') }}" class="hover:text-emerald-700">{{ __('nav.approvals') }}
                @php($unread = auth()->user()->unreadNotifications()->count())
                @if($unread)<span class="ms-1 rounded-full bg-red-600 text-white text-xs px-1.5 ltr-num">{{ $unread }}</span>@endif
            </a>
            <a href="{{ route('customers.index') }}" class="hover:text-emerald-700">{{ __('nav.customers') }}</a>
            <a href="{{ route('land.index') }}" class="hover:text-emerald-700">{{ __('nav.land') }}</a>
            @if(auth()->user()->hasRole('admin'))
                <a href="{{ route('rates.index') }}" class="hover:text-emerald-700">{{ __('nav.rates') }}</a>
            @endif
        </nav>
        <div class="ms-auto flex items-center gap-3 text-sm">
            @if(($allProjects ?? collect())->count() > 1)
            <form method="POST" action="{{ route('project.switch') }}">@csrf
                <select name="project_id" onchange="this.form.submit()" class="border rounded px-2 py-1">
                    @foreach($allProjects as $p)
                        <option value="{{ $p->id }}" @selected($currentProject?->id === $p->id)>{{ $p->code }} – {{ $rtl && $p->name_ur ? $p->name_ur : $p->name }}</option>
                    @endforeach
                </select>
            </form>
            @elseif($currentProject)
                <span class="text-slate-500">{{ $currentProject->code }}</span>
            @endif
            <a href="{{ route('locale', $rtl ? 'en' : 'ur') }}" class="border rounded px-2 py-1">{{ $rtl ? 'English' : 'اردو' }}</a>
            <span class="text-slate-500">{{ auth()->user()->name }}</span>
            <form method="POST" action="{{ route('logout') }}">@csrf<button class="text-slate-500 hover:text-red-600">{{ __('app.logout') }}</button></form>
        </div>
    </div>
</header>
@endauth

<main class="max-w-7xl mx-auto px-4 py-6">
    @if(session('status'))
        <div class="mb-4 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2">{{ session('status') }}</div>
    @endif
    @if($errors->any())
        <div class="mb-4 rounded bg-red-50 border border-red-200 text-red-800 px-4 py-2">
            @foreach($errors->all() as $e)<div>{{ $e }}</div>@endforeach
        </div>
    @endif
    @yield('content')
</main>
@stack('scripts')
</body>
</html>
