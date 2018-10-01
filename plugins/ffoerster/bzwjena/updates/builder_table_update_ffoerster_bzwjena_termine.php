<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaTermine extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_termine', function($table)
        {
            $table->string('termin_location')->nullable();
            $table->integer('termin_price')->nullable();
            $table->date('termin_deadline')->nullable();
            $table->boolean('termin_featured');
            $table->text('termin_description')->nullable();
            $table->text('termin_teaser')->nullable();
            $table->boolean('termin_active');
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_termine', function($table)
        {
            $table->dropColumn('termin_location');
            $table->dropColumn('termin_price');
            $table->dropColumn('termin_deadline');
            $table->dropColumn('termin_featured');
            $table->dropColumn('termin_description');
            $table->dropColumn('termin_teaser');
            $table->dropColumn('termin_active');
        });
    }
}
