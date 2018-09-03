<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaTermine2 extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_termine', function($table)
        {
            $table->date('termin_date')->nullable();
            $table->string('termin_location')->change();
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_termine', function($table)
        {
            $table->dropColumn('termin_date');
            $table->string('termin_location', 191)->change();
        });
    }
}
