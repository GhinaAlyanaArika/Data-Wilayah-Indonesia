<?php

namespace App\Http\Controllers;

class WilayahController extends Controller
{
    /**
     * Menampilkan halaman aplikasi Data Wilayah Indonesia.
     * Seluruh data diambil di sisi browser (JavaScript Fetch API)
     * langsung dari Public API Emsifa.
     */
    public function index()
    {
        return response()->file(public_path('wilayah/index.html'), [
            'Content-Type' => 'text/html; charset=UTF-8',
        ]);
    }
}
