@extends('layouts.app')
@section('title', __('app.login'))
@section('content')
<div class="max-w-sm mx-auto mt-16 bg-white rounded-lg shadow p-6">
    <div class="flex justify-between items-center mb-4">
        <h1 class="text-lg font-semibold">{{ __('app.name') }}</h1>
        <a href="{{ route('locale', app()->getLocale() === 'ur' ? 'en' : 'ur') }}" class="text-sm border rounded px-2">{{ app()->getLocale() === 'ur' ? 'English' : 'اردو' }}</a>
    </div>
    <form method="POST" action="{{ route('login') }}" class="space-y-3">@csrf
        <label class="block text-sm">{{ __('app.email') }}
            <input type="email" name="email" value="{{ old('email') }}" required autofocus class="mt-1 w-full border rounded px-3 py-2 ltr-num">
        </label>
        <label class="block text-sm">{{ __('app.password') }}
            <input type="password" name="password" required class="mt-1 w-full border rounded px-3 py-2">
        </label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="remember" value="1"> {{ __('app.remember') }}</label>
        <button class="w-full bg-emerald-700 text-white rounded py-2">{{ __('app.login') }}</button>
    </form>
</div>
@endsection
