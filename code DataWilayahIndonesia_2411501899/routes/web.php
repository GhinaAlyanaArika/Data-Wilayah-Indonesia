<?php

use App\Http\Controllers\WilayahController;
use Illuminate\Support\Facades\Route;

// Halaman utama = aplikasi Data Wilayah Indonesia
Route::get('/', [WilayahController::class, 'index'])->name('wilayah');
Route::get('/wilayah', [WilayahController::class, 'index']);
