<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaAngebote extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_angebote', function($table)
        {
            $table->text('angebot_description')->nullable();
            $table->string('angebot_subtitle')->nullable();
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_angebote', function($table)
        {
            $table->dropColumn('angebot_description');
            $table->dropColumn('angebot_subtitle');
        });
    }
}
