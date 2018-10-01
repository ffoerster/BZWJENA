<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaWeiterbildung extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_weiterbildung', function($table)
        {
            $table->string('wb_subtitle')->nullable();
            $table->text('wb_description')->nullable();
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_weiterbildung', function($table)
        {
            $table->dropColumn('wb_subtitle');
            $table->dropColumn('wb_description');
        });
    }
}
